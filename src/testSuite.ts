// import {Log} from 'vscode-test-adapter-util';
import * as vscode from 'vscode';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

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
  run(node: BanditTestGroup|BanditTest): Promise<SpawnReturns>;
  dry(): Promise<SpawnReturns>;
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
  public abstract start(): Promise<Array<BanditTestNode>>;
  public abstract stop(): Promise<Array<BanditTestNode>>;
  public abstract finish(status: BanditTestStatus, message?: string):
      Promise<Array<BanditTestNode>>;
  // Konstruktor
  constructor(
      public parent: BanditTestGroup|undefined,
      public suite: TestSuite|undefined) {}
  public get parents(): Array<BanditTestGroup> {
    let parents = new Array<BanditTestGroup>();
    let p = this.parent;
    while (p) {
      parents.push(p);
      p = p.parent;
    }
    return parents.reverse();
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
      suite: TestSuite|undefined,         //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public message?: string) {
    super(parent, suite);
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
    var test = new BanditTest(this, this.suite, name, file, line, skipped);
    this.add(test);
    return test;
  }

  public addSuite(name: string, file?: string, line?: number): BanditTestGroup {
    var suite = new BanditTestGroup(this, this.suite, name, file, line);
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

  public start(): Promise<BanditTestNode[]> {
    return new Promise<BanditTestNode[]>((resolve) => {
      new Promise<BanditTestNode[][]>(() => {
        let promises = new Array<Promise<BanditTestNode[]>>();
        for (var node of this.children) {
          promises.push(node.start());
        }
        return Promise.all(promises);
      }).then((nodes: BanditTestNode[][]) => {
        resolve(helper.flatten<BanditTestNode>(nodes));
      });
    });
  }

  public stop(): Promise<Array<BanditTestNode>> {
    return new Promise<BanditTestNode[]>((resolve) => {
      new Promise<BanditTestNode[][]>(() => {
        let promises = new Array<Promise<BanditTestNode[]>>();
        for (var node of this.children) {
          promises.push(node.stop());
        }
        return Promise.all(promises);
      }).then((nodes: BanditTestNode[][]) => {
        resolve(helper.flatten<BanditTestNode>(nodes));
      });
    });
  }

  public finish(status: BanditTestStatus, message?: string):
      Promise<Array<BanditTestNode>> {
    return new Promise((resolve) => {
      this.message = message;
      let promises = new Array<Promise<BanditTestNode[]>>();
      for (var node of this.children) {
        promises.push(node.finish(status));
      }
      Promise.all(promises).then((nodes: BanditTestNode[][]) => {
        resolve(helper.flatten<BanditTestNode>(nodes));
      });
    });
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
      suite: TestSuite|undefined,         //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public skipped?: boolean,           //
      public message?: string) {
    super(parent, suite);
  }

  public get status(): BanditTestStatus {
    return this.test_status;
  }

  public start(): Promise<BanditTestNode[]> {
    return new Promise((resolve, reject) => {
      let nodes = new Array<BanditTestNode>();
      var started = this.status !== BanditTestStatusRunning;
      if (started) {
        this.test_status = BanditTestStatusRunning;
        nodes.push(this);
      }
      resolve(nodes);
    });
  }

  public finish(status: BanditTestStatus, message?: string):
      Promise<BanditTestNode[]> {
    return new Promise((resolve) => {
      this.test_status = status;
      this.message = message;
      resolve(new Array<BanditTestNode>(this));
    });
  }

  public stop(): Promise<BanditTestNode[]> {
    return new Promise(() => {
      let nodes = new Array<BanditTestNode>();
      var stopped = this.status != BanditTestStatusIdle
      if (stopped) {
        this.test_status = BanditTestStatusSkipped;
        nodes.push(this);
      }
      return nodes;
    });
  }
}

interface TestSuite {
  notifyTestRunStatus(node: TestNode): void
}


/************************************************************************/
/**
 * Test-Suite-Klasse
 */
export class BanditTestSuite implements TestSuite {
  private testsuite = new BanditTestGroup(undefined, this, 'root', 'root');

  constructor(
      private readonly testStatesEmitter:
          vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>,
      private readonly testsEmitter:
          vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>,
      private spawner: TestSpawner) {}

  public initFromString(stdout: string): Promise<void> {
    return new Promise(() => {
      this.createFromString(stdout)
          .then((suite) => {
            this.testsuite = suite;
            this.testsuite.suite = this;
            let info = this.getGroupStatusInfo(this.testsuite);
            return info;
          })
          .then((info) => {
            this.testsEmitter.fire(
                <TestLoadFinishedEvent>{type: 'finished', suite: info});
          });
    });
  }

  private createFromString(stdout: string): Promise<BanditTestGroup> {
    return new Promise((resolve, reject) => {
      let root = new BanditTestGroup(undefined, undefined, 'root', 'root');
      let messages = Array<String>();
      let isGroup = (line: string): boolean => {
        return line.trim().startsWith('describe');
      };
      let isTest = (line: string): boolean => {
        return line.trim().startsWith('- it ')
      };
      let parseGroupLabel = (line: string): string => {
        return line.trim().replace(/describe(.*)/i, '\$1').trim();
      };
      let parseTestLabel = (line: string): string => {
        return line.trim().replace(/- it (.*)\.\.\..*/i, '\$1').trim();
      };
      let parseStatus = (line: string): BanditTestStatus|undefined => {
        var matches = line.match(/(.*) \.\.\. (error|failure|ok|skipped)/i);
        if (matches && matches.length >= 2) {
          var status = matches[2].toLowerCase();
          if (status == 'ok') {
            return BanditTestStatusPassed;
          } else if (status == 'skipped') {
            return BanditTestStatusSkipped;
          } else if (status == 'error' || status == 'failure') {
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
      let finishNode =
          (node: BanditTestNode|undefined,
           status: BanditTestStatus|undefined) => {
            if (status && node) {
              node.message = getMessage();
              node.finish(status);
            }
          };
      let current_suite = root;
      let node: BanditTestNode|undefined;
      let last_indentation = 0;
      let status: BanditTestStatus|undefined;
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
                reject(new Error(
                    'Fehlender Parent bei node mit der id "' +
                    current_suite.id + '"'));
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
        }
      }
      // Ggf. Ergebnis verarbeiten:
      finishNode(node, status);
      resolve(root);
    });
  }

  public updateFromString(node: TestNode, stdout: string): Promise<void> {
    return new Promise(() => {
      this.createFromString(stdout).then((parsed_result) => {
        let result_node = parsed_result.find(node.id);
        if (result_node) {
          node.finish(result_node.status, result_node.message)
              .then((updated_nodes) => {
                for (let node of updated_nodes) {
                  this.notifyTestRunStatus(node);
                }
              });
        }
      });
    });
  }

  public init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.spawner.dry().then((ret: SpawnReturns) => {
        if (ret.status < 0) {
          reject(ret.error.message);
        } else {
          this.initFromString(ret.stdout);
        }
      });
    });
  }

  public start(ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      new Promise<Promise<void>[]>(() => {
        let nodes = new Array<BanditTestNode>();
        let unique_ids = new Set<string>(ids);
        for (let id of unique_ids) {
          let r = new RegExp(helper.escapeRegExp(id));  // ggf. ^id$
          nodes = nodes.concat(this.testsuite.findAll(r));
        }
        let promises = new Array<Promise<void>>();
        this.notifyTestRunStart(nodes);
        for (let node of nodes) {
          promises.push(new Promise<void>((resolve, reject) => {
            node.start().then(() => {
              if (asTest(node)) {
                this.spawner.run(node).then((ret: SpawnReturns) => {
                  if (ret.status < 0) {
                    node.finish(BanditTestStatusFailed);
                    reject(ret.error.message);
                  } else {
                    this.updateFromString(node, ret.stdout).then(() => {
                      resolve();
                    });
                  }
                });
              } else {
                resolve();
              }
            });
          }));
        }
        return Promise.all(promises);
      });
    });
  }

  public cancel() {
    this.testsuite.stop();
  }

  public finish(
      node: BanditTestNode, status: BanditTestStatus, message?: string) {
    node.finish(status, message);
  }

  public notifyTestRunStatus(node: BanditTestNode) {
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

  private getStatusInfo(node: BanditTestNode): TestInfo|TestSuiteInfo
      |undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusInfo(test);
    } else if (group) {
      return this.getGroupStatusInfo(group);
    }
    return undefined;
  }

  private getTestStatusInfo(test: BanditTest): TestInfo {
    return {
      type: 'test',
      id: test.id,
      label: test.label,
      file: test.file,
      line: test.line,
      skipped: test.skipped
    } as TestInfo;
  }

  private getGroupStatusInfo(group: BanditTestGroup): TestSuiteInfo {
    let child_info = new Array<TestInfo|TestSuiteInfo>();
    for (let child of group.children) {
      let info = this.getStatusInfo(child);
      if (info) {
        child_info.push(info);
      }
    }
    return {
      type: 'suite',
      id: group.id,
      label: group.label,
      file: group.file,
      line: group.line,
      children: child_info
    } as TestSuiteInfo;
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