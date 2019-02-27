import {Mutex} from 'async-mutex';

import {TestSuiteConfiguration} from '../configuration/configuration';
import {BaseSymbolResolver} from '../configuration/symbol';
import {TestNodeI} from '../project/test';
import {Logger} from '../util/logger';

import {TestSpawnerI} from './testspawner';

class TestQueueEntry {
  constructor(
      public node: TestNodeI, public slot?: number,
      public running: boolean = false) {}
}

export class TestQueue {
  private queue = new Map<string, TestQueueEntry>();
  private queueMutex = new Mutex();

  constructor(
      private readonly config: TestSuiteConfiguration,
      private readonly spawner: TestSpawnerI,
      private readonly notifyChanged: (node: TestNodeI) => void) {}

  public push(nodes: TestNodeI[]) {
    nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.queueMutex.acquire().then((release) => {
      nodes.forEach(node => {
        if (!this.nodeAlreadyExists(node)) {
          this.queue.set(node.id, new TestQueueEntry(node));
        }
      });
      release();
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
      entry.running = true;
      entry.slot = this.getNextSlot();
      release();
      this.notifyChanged(entry.node);
      this.spawner.run(entry.node, [new SlotSymbolResolver(entry.slot || 0)])
          .then(nodes => {
            nodes.map(this.notifyChanged, this);
            this.finish(entry);
          })
          .catch(e => {
            Logger.instance.error(
                `Fehler beim Starten des Tests "${entry.node.id}"`);
            this.finish(entry);
          });
    });
  }

  private getNextSlot(): number|undefined {
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
      this.queue.delete(entry.node.id);
      this.continue();
      release();
    });
  }

  public stop() {
    this.queueMutex.acquire().then((release) => {
      this.spawner.stop();
      this.queue.clear();
      release();
    });
  }
}

export class SlotSymbolResolver extends BaseSymbolResolver {
  constructor(public slot: number) {
    super();
    this.registerSymbol(/\${run:Slot}/g, () => {
      return `${this.slot}`;
    });
  }
}
