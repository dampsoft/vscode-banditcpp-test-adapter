
import {BanditSpawner} from './bandit'
import {BanditTestSuiteConfiguration} from './configuration';
import {BanditTestNode} from './test';

class TestQueueEntry {
  constructor(public node: BanditTestNode, public running: boolean = false) {}
}

export class Testqueue {
  private queue = new Map<string, TestQueueEntry>();

  constructor(
      private readonly config: BanditTestSuiteConfiguration,
      private readonly spawner: BanditSpawner,
      private readonly notifyChanged: (node: BanditTestNode) => void) {}

  public push(nodes: BanditTestNode[]) {
    nodes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (let node of nodes) {
      if (!this.nodeAlreadyExists(node)) {
        this.queue.set(node.id, new TestQueueEntry(node));
      }
    }
    this.continue();
  }

  private nodeAlreadyExists(node: BanditTestNode) {
    return this.queue.has(node.id);
  }

  private getEntries(running: boolean): TestQueueEntry[] {
    let entries = new Array<TestQueueEntry>();
    for (let [, entry] of this.queue.entries()) {
      if (entry.running == running) {
        entries.push(entry);
      }
    }
    return entries;
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
      if (block <= 0) break;
      this.start(entry);
      block -= 1;
    }
  }

  private start(entry: TestQueueEntry) {
    entry.running = true;
    this.notifyChanged(entry.node);
    this.spawner.run(entry.node).then((nodes) => {
      nodes.map(this.notifyChanged, this);
      this.finish(entry);
      this.continue();
    });
  }

  private finish(entry: TestQueueEntry) {
    this.queue.delete(entry.node.id);
  }

  public stop() {
    this.spawner.stop();
    this.queue.clear();
  }
}