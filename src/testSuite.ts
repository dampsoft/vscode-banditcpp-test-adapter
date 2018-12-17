// import {Log} from 'vscode-test-adapter-util';
import * as vscode from 'vscode';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

import * as helper from './helper'
import {SpawnReturns} from './spawner'

export type BanditTestStatus = 'idle'|'running'|'ok'|'failed'|'skipped';
export const BanditTestStatusIdle: BanditTestStatus = 'idle';
export const BanditTestStatusRunning: BanditTestStatus = 'running';
export const BanditTestStatusPassed: BanditTestStatus = 'ok';
export const BanditTestStatusFailed: BanditTestStatus = 'failed';
export const BanditTestStatusSkipped: BanditTestStatus = 'skipped';

export type BanditTestType = 'test'|'suite';
export const Test: BanditTestType = 'test';
export const Suite: BanditTestType = 'suite';

export type BanditTestNode = BanditTest|BanditTestGroup;


/************************************************************************/
/**
 * Test-Spawner Interface
 */
export interface TestSpawner {
  run(node: BanditTestNode): Promise<SpawnReturns>;
  dry(): Promise<SpawnReturns>;
  stop(): void;
}

/**
 * Basis Test-Knoten
 */
abstract class TestNode {
  // Getter
  public abstract get type(): BanditTestType;
  public abstract get label(): string;
  public abstract get status(): BanditTestStatus;
  public get id(): string {
    if (this.parent) {
      return this.parent.id + '.' + this.label;
    }
    return this.label;
  }
  // API
  public abstract start(): BanditTestNode[];
  public abstract stop(): BanditTestNode[];
  public abstract finish(status: BanditTestStatus, message?: string):
      BanditTestNode[];
  // Konstruktor
  constructor(public parent: BanditTestGroup|undefined) {}
  public get parents(): Array<BanditTestGroup> {
    let parents = new Array<BanditTestGroup>();
    let p = this.parent;
    while (p) {
      parents.push(p);
      p = p.parent;
    }
    return parents.reverse();
  }
  public abstract getTestInfo(): TestSuiteInfo|TestInfo;
  public get displayTitle(): string {
    if (this.parent) {
      return this.parent.displayTitle + ' ' + this.label;
    } else {
      return this.label;
    }
  }
}


/************************************************************************/
/**
 * Testsuite-Klasse
 */
export class BanditTestGroup extends TestNode {
  public children = new Array<BanditTestNode>();
  public readonly type = Suite;

  constructor(
      parent: BanditTestGroup|undefined,  //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public message?: string) {
    super(parent);
  }

  get status(): BanditTestStatus {
    let aggr_status: BanditTestStatus = BanditTestStatusIdle;
    for (let node of this.children) {
      let node_status = node.status;
      if (node_status == BanditTestStatusRunning) {
        return BanditTestStatusRunning;
      } else if (node_status != BanditTestStatusIdle) {
        if (aggr_status == BanditTestStatusIdle) {
          aggr_status = node_status;
        } else if (node_status == BanditTestStatusFailed) {
          aggr_status = BanditTestStatusFailed;
        } else if (
            aggr_status == BanditTestStatusSkipped &&
            node_status == BanditTestStatusPassed) {
          aggr_status = BanditTestStatusPassed;
        }
      }
    }
    return aggr_status;
  }

  public get tests(): Array<BanditTest> {
    let test_children = new Array<BanditTest>();
    for (let child of this.children) {
      let test = asTest(child);
      let group = asTestGroup(child);
      if (test) {
        test_children.push(test);
      } else if (group) {
        test_children = test_children.concat(group.tests);
      }
    }
    return test_children;
  }

  public add(node: BanditTestNode): BanditTest|BanditTestGroup {
    this.children.push(node);
    node.parent = this;
    return node;
  }

  public addTest(name: string, file?: string, line?: number, skipped?: boolean):
      BanditTest {
    var test = new BanditTest(this, name, file, line, skipped);
    this.add(test);
    return test;
  }

  public addSuite(name: string, file?: string, line?: number): BanditTestGroup {
    var suite = new BanditTestGroup(this, name, file, line);
    this.add(suite);
    return suite;
  }

  public findAll(id: string|RegExp): Array<BanditTestNode> {
    var matches = new Array<BanditTestNode>();
    for (var child of this.children) {
      if (child.id.match(id)) {
        matches.push(child);
      } else {
        let group = asTestGroup(child);
        if (group) {
          matches = matches.concat(group.findAll(id));
        }
      }
    }
    return matches;
  }

  public find(id: string|RegExp): BanditTestNode|undefined {
    var matches = this.findAll(id);
    return matches ? matches[0] : undefined;
  }

  public findAllByLabel(label: string|RegExp): Array<BanditTestNode> {
    var matches = new Array<BanditTestNode>();
    for (var child of this.children) {
      if (child.label.match(label)) {
        matches.push(child);
      }
    }
    return matches;
  }

  public findByLabel(label: string|RegExp): BanditTestNode|undefined {
    var matches = this.findAllByLabel(label);
    return matches ? matches[0] : undefined;
  }

  public start(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    for (var node of this.children) {
      nodes = nodes.concat(node.start());
    }
    return nodes;
  }

  public stop(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    for (var node of this.children) {
      nodes = nodes.concat(node.stop());
    }
    return nodes;
  }

  public finish(status: BanditTestStatus, message?: string): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    for (var node of this.children) {
      nodes = nodes.concat(node.finish(status));
    }
    return nodes;
  }

  public getTestInfo(): TestSuiteInfo|TestInfo {
    let child_info = new Array<TestInfo|TestSuiteInfo>();
    for (let child of this.children) {
      child_info.push(child.getTestInfo());
    }
    return {
      type: 'suite',
      id: this.id,
      label: this.label,
      file: this.file,
      line: this.line,
      children: child_info
    } as TestSuiteInfo;
  }
}


/************************************************************************/
/**
 * Test Klasse
 */
export class BanditTest extends TestNode {
  public readonly type = 'test';
  private test_status: BanditTestStatus = BanditTestStatusIdle;

  constructor(
      parent: BanditTestGroup|undefined,  //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public skipped?: boolean,           //
      public message?: string) {
    super(parent);
  }

  public get status(): BanditTestStatus {
    return this.test_status;
  }

  public start(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status !== BanditTestStatusRunning) {
      this.test_status = BanditTestStatusRunning;
      nodes.push(this);
    }
    return nodes;
  }

  public finish(status: BanditTestStatus, message?: string): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status !== status) {
      this.test_status = status;
      this.message = message;
      nodes.push(this);
    }
    return nodes;
  }

  public stop(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status != BanditTestStatusIdle) {
      this.test_status = BanditTestStatusSkipped;
      nodes.push(this);
    }
    return nodes;
  }

  public getTestInfo(): TestSuiteInfo|TestInfo {
    return {
      type: 'test',
      id: this.id,
      label: this.label,
      file: this.file,
      line: this.line,
      skipped: this.skipped
    } as TestInfo;
  }
}


/************************************************************************/
/**
 * Test-Suite-Klasse
 */
export class BanditTestSuite {
  private testsuite = new BanditTestGroup(undefined, 'root', 'root');

  constructor(
      private readonly testStatesEmitter:
          vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>,
      private spawner: TestSpawner) {}

  public init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.spawner.dry().then((ret: SpawnReturns) => {
        if (ret.status < 0) {
          reject(ret.error.message);
        } else {
          this.testsuite = this.createFromString(ret.stdout);
          resolve();
        }
      });
    });
  }

  public start(ids: string[]): Promise<void> {
    return new Promise((resolve) => {
      let nodes = new Array<BanditTestNode>();
      let unique_ids = new Set<string>(ids);
      for (let id of unique_ids) {
        let r = new RegExp(helper.escapeRegExp(id));  // ggf. ^id$
        nodes = nodes.concat(this.testsuite.findAll(r));
      }
      let started_nodes = new Array<BanditTestNode>();
      for (var node of nodes) {
        started_nodes = started_nodes.concat(node.start());
      }
      started_nodes = helper.removeDuplicates(started_nodes, 'id');
      this.notifyTestRunStart(nodes);
      let promises = new Array<Promise<void>>();
      for (let node of started_nodes) {
        if (asTest(node)) {
          promises.push(this.createTestRunSpawn(node));
        }
      }
      Promise.all(promises).then(() => {
        resolve();
      });
    });
  }

  private createTestRunSpawn(node: BanditTestNode): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.spawner.run(node)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              this.finish(node, BanditTestStatusFailed);
              reject(ret.error.message);
            } else {
              this.updateFromString(node, ret.stdout);
              resolve();
            }
          })
          .catch((e) => {
            reject(e);
          });
    });
  }

  public cancel() {
    this.testsuite.stop();
    this.spawner.stop();
    this.notifyTestRunFinished();
  }

  public getTestInfo(): TestSuiteInfo|TestInfo {
    return this.testsuite.getTestInfo();
  }

  private createFromString(stdout: string): BanditTestGroup {
    let root = new BanditTestGroup(undefined, '');
    let messages = Array<String>();
    let isGroup = (line: string): boolean => {
      return line.trim().startsWith('describe');
    };
    let isTest = (line: string): boolean => {
      return line.trim().startsWith('- it ')
    };
    let getFailureBlock = (text: string): string|undefined => {
      const start = '\nThere were failures!';
      const end = '\nTest run';
      let blockStartIdx = text.indexOf(start);
      if (blockStartIdx >= 0) {
        blockStartIdx += start.length;
        let blockEndIdx = text.indexOf(end, blockStartIdx);
        if (blockEndIdx > blockStartIdx) {
          return text.substring(blockStartIdx, blockEndIdx);
        }
      }
      // let block = text.match(/(?<=There were failures!)(.*\n)*(?=Test
      // run)/i); if (block) {
      //   return block[0];
      // }
      return undefined;
    };
    let parseGroupLabel = (line: string): string => {
      return line.trim().replace(/describe(.*)/i, '\$1').trim();
    };
    let parseTestLabel = (line: string): string => {
      return line.trim().replace(/- it (.*)\.\.\..*/i, '\$1').trim();
    };
    let parseStatus = (line: string): BanditTestStatus|undefined => {
      var matches =
          line.match(/(.*) \.\.\. (error|failure|failed|ok|skipped)/i);
      if (matches && matches.length >= 2) {
        var status = matches[2].toLowerCase();
        if (status == 'ok') {
          return BanditTestStatusPassed;
        } else if (status == 'skipped') {
          return BanditTestStatusSkipped;
        } else if (
            status == 'error' || status == 'failure' || status == 'failed') {
          return BanditTestStatusFailed;
        }
      }
      return messages.length > 0 ? BanditTestStatusFailed :
                                   BanditTestStatusIdle;
    };
    let clearMessages = () => {
      messages = [];
    };
    let getMessage = (): string => {
      return messages.join('\n');
    };
    let error_nodes = new Array<BanditTestNode>();
    let finishNode =
        (node: BanditTestNode|undefined,
         status: BanditTestStatus|undefined) => {
          if (status && node) {
            node.message = getMessage();
            let nodes = node.finish(status);
            if (status == BanditTestStatusFailed) {
              error_nodes = error_nodes.concat(nodes);
            }
          }
        };
    let current_suite = root;
    let node: BanditTestNode|undefined;
    let last_indentation = 0;
    let status: BanditTestStatus|undefined;
    stdout = stdout.replace('\r\n', '\n');
    let lines = stdout.split(/[\n]+/);
    for (let line of lines) {
      if (line.length) {
        let indentation = line.search(/\S/);
        if (isGroup(line) || isTest(line)) {
          // Einrückung anpassen:
          let indentation_diff = last_indentation - indentation;
          while (indentation_diff > 0) {
            if (current_suite.parent) {
              current_suite = current_suite.parent;
            } else {
              throw new Error(
                  'Fehlender Parent bei node mit der id "' + current_suite.id +
                  '"');
            }
            indentation_diff -= 1;
          }
          // Node hinzufügen:
          if (isGroup(line)) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            node = current_suite =
                current_suite.addSuite(parseGroupLabel(line));
          } else if (isTest(line)) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            node = current_suite.addTest(parseTestLabel(line));
          }
        } else {
          messages.push(line);
        }
        // Ergebnis verarbeiten:
        status = parseStatus(line);
        finishNode(node, status);
        last_indentation = indentation;
        node = undefined;
      }
    }
    // Get error messages:
    let block = getFailureBlock(stdout);
    if (block) {
      let nodes = helper.removeDuplicates(error_nodes, 'id');
      let blocks = block.trim().split(/[\n/]{3,}/);
      for (let error of blocks) {
        let lines = error.split(/[\n]+/);
        if (lines.length > 1) {
          for (let node of nodes) {
            if (lines[0].startsWith(node.displayTitle.trim() + ':')) {
              node.message = lines.slice(1, lines.length).join('\n');
            }
          }
        }
      }
    }
    return root;
  }

  private updateFromString(node: TestNode, stdout: string) {
    let parsed_result = this.createFromString(stdout);
    let result_node = parsed_result.find(node.id);
    if (result_node) {
      let updated_nodes = node.finish(result_node.status, result_node.message);
      for (let node of updated_nodes) {
        this.notifyTestRunStatus(node);
      }
    }
  }

  private finish(
      node: BanditTestNode, status: BanditTestStatus, message?: string) {
    let updated_nodes = node.finish(status, message)
    for (let node of updated_nodes) {
      this.notifyTestRunStatus(node);
    }
  }

  private notifyTestRunStatus(node: BanditTestNode) {
    let e = this.getStatusEvent(node);
    if (e) {
      this.testStatesEmitter.fire(e);
      if (this.testsuite.status != BanditTestStatusRunning) {
        this.notifyTestRunFinished();
      }
    }
  }

  private notifyTestRunStart(nodes: Array<BanditTestNode>) {
    let ids = new Array<string>();
    for (let node of nodes) {
      let group = asTestGroup(node);
      if (group) {
        let tests = group.tests;
        for (let test of tests) {
          ids.push(test.id);
        }
      } else {
        ids.push(node.id);
      }
    }
    this.testStatesEmitter.fire(
        <TestRunStartedEvent>{type: 'started', tests: ids});
  }

  private notifyTestRunFinished() {
    this.testStatesEmitter.fire(<TestRunFinishedEvent>{type: 'finished'});
  }

  private getStatusEvent(node: BanditTestNode): TestEvent|TestSuiteEvent
      |undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusEvent(test);
    } else if (group) {
      return this.getGroupStatusEvent(group);
    }
    return undefined;
  }

  private getTestStatusEvent(test: BanditTest): TestEvent {
    let status;
    if (test.status == BanditTestStatusRunning) {
      status = 'running';
    } else if (test.status == BanditTestStatusPassed) {
      status = 'passed';
    } else if (test.status == BanditTestStatusFailed) {
      status = 'failed';
    } else {
      status = 'skipped';
    }
    return {
      type: 'test',
      test: test.id,
      state: status,
      message: test.message
    } as TestEvent;
  }

  private getGroupStatusEvent(group: BanditTestGroup): TestSuiteEvent {
    let status;
    if (group.status == BanditTestStatusRunning) {
      status = 'running';
    } else {
      status = 'completed';
    }
    return {
      type: 'suite',
      suite: group.id,
      state: status,
      message: group.message
    } as TestSuiteEvent;
  }
}

export function asTest(node: any): BanditTest|undefined {
  return node instanceof BanditTest ? node as BanditTest : undefined;
}

export function asTestGroup(node: any): BanditTestGroup|undefined {
  return node instanceof BanditTestGroup ? node as BanditTestGroup : undefined;
}