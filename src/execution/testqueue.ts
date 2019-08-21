import { Mutex } from 'async-mutex';

import { BaseSymbolResolver } from '../configuration/symbol';
import { TestNodeI } from '../project/test';

import { Messages } from './messages';
import { TestSpawnerI } from './testspawner';

/**
 * Dynamischer Symbol-Resolver für den aktuellen Prozess-Index
 * ${processNumber}
 */
export class SlotSymbolResolver extends BaseSymbolResolver {
  constructor(public slot: number) {
    super();
    this.registerSymbol(/\${processNumber}/g, () => {
      return `${this.slot}`;
    });
  }
}

/**
 * Konfiguration für die Test-Queue
 */
export interface TestQueueConfigurationI {
  readonly parallelProcessLimit: number;
}

/**
 * Test-Queue zum abarbeiten von Tests unter der Bedingung, dass eine maximale
 * Zahl paralleler Prozesse nicht überschritten werden darf.
 */
export class TestQueue {
  private queue = new Map<string, TestQueueEntry>();
  private queueMutex = new Mutex();

  constructor(
    private readonly config: TestQueueConfigurationI,
    private readonly notifyChanged: (node: TestNodeI) => void) { }

  public push(nodes: TestNodeI[], spawner: TestSpawnerI) {
    // sortString(nodes, true, 'id');
    this.queueMutex.acquire().then((release) => {
      try {
        nodes.forEach(node => {
          if (!this.nodeAlreadyExists(node)) {
            this.queue.set(node.id, new TestQueueEntry(node, spawner));
          }
        });
      } finally {
        release();
      }
      this.continue();
    });
  }

  private nodeAlreadyExists(node: TestNodeI) {
    return this.queue.has(node.id);
  }

  private getEntries(running: boolean): TestQueueEntry[] {
    return Array.from(this.queue.values())
      .filter(entry => entry.running == running);
  }

  private getRunningEntries(): TestQueueEntry[] {
    return this.getEntries(true);
  }

  private getPendingEntries(): TestQueueEntry[] {
    return this.getEntries(false);
  }

  private countRunningTests(): number {
    return this.getRunningEntries().length;
  }

  private countPendingTests(): number {
    return this.getPendingEntries().length;
  }

  private continue() {
    if (this.countPendingTests() <= 0) return;
    let block = this.config.parallelProcessLimit - this.countRunningTests();
    if (block <= 0) return;
    let pending = this.getPendingEntries();
    for (let entry of pending) {
      if (block-- <= 0) break;
      this.start(entry);
    }
  }

  private start(entry: TestQueueEntry) {
    this.queueMutex.acquire().then((release) => {
      try {
        entry.running = true;
        entry.slot = this.getNextSlot();
      } finally {
        release();
      }
      this.notifyChanged(entry.node);
      entry.spawner.run(entry.node, [new SlotSymbolResolver(entry.slot || 0)])
        .then(nodes => {
          nodes.map(this.notifyChanged, this);
          this.finish(entry);
        })
        .catch(() => {
          Messages.getTestQueueExecutionError(entry.node.id).notify();
          this.finish(entry);
        });
    });
  }

  private getNextSlot(): number | undefined {
    let freeSlots = new Set<number>(
      Array.from(Array(this.config.parallelProcessLimit).keys()));
    let usedSlots = this.getRunningEntries().map(e => e.slot);
    usedSlots.forEach((slot) => {
      if (slot != undefined) {
        freeSlots.delete(slot);
      }
    });
    return freeSlots.size > 0 ? Math.min(...freeSlots) : undefined;
  }

  private finish(entry: TestQueueEntry) {
    this.queueMutex.acquire().then((release) => {
      try {
        this.queue.delete(entry.node.id);
      } finally {
        release();
      }
      this.continue();
    });
  }

  public stop() {
    this.queueMutex.acquire().then((release) => {
      try {
        this.getRunningEntries().forEach(e => e.spawner.stop());
        this.queue.clear();
      } finally {
        release();
      }
    });
  }
}

/**
 * Interne Hilfsklasse mit Zusatzinformationen zu einem Test-Knoten
 */
class TestQueueEntry {
  constructor(
    public node: TestNodeI, public spawner: TestSpawnerI,
    public slot?: number, public running: boolean = false) { }
}