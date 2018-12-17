// import {Log} from 'vscode-test-adapter-util';
import * as vscode from 'vscode';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

import * as helper from './helper'
import {SpawnReturns} from './spawner'
import {asTest, asTestGroup, BanditTest, BanditTestGroup, BanditTestNode} from './test'
import * as teststatus from './teststatus'


/************************************************************************/
/**
 * Test-Spawner Interface
 */
export interface TestSpawner {
  run(node: BanditTestNode): Promise<SpawnReturns>;
  dry(): Promise<SpawnReturns>;
  stop(): void;
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
      this.spawner.dry()
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              reject(ret.error.message);
            } else {
              this.testsuite = this.createFromString(ret.stdout);
              resolve();
            }
          })
          .catch((e) => {
            reject(e);
          });
    });
  }

  public start(ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
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
      this.notifyStart(nodes);
      let promises = new Array<Promise<void>>();
      for (let node of started_nodes) {
        if (asTest(node)) {
          promises.push(this.createTestRunSpawn(node));
        }
      }
      Promise.all(promises)
          .then(() => {
            resolve();
          })
          .catch((e) => {
            reject(e);
          });
    });
  }

  private createTestRunSpawn(node: BanditTestNode): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.spawner.run(node)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              this.finish(node, teststatus.Failed);
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
    this.notifyFinished();
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
      const end = '\nTest run complete.';
      let blockStartIdx = text.indexOf(start);
      if (blockStartIdx >= 0) {
        blockStartIdx += start.length;
        let blockEndIdx = text.indexOf(end, blockStartIdx);
        if (blockEndIdx > blockStartIdx) {
          return text.substring(blockStartIdx, blockEndIdx);
        }
      }
      return undefined;
    };
    let parseGroupLabel = (line: string): string => {
      return line.trim().replace(/describe(.*)/i, '\$1').trim();
    };
    let parseTestLabel = (line: string): string => {
      return line.trim().replace(/- it (.*)\.\.\..*/i, '\$1').trim();
    };
    let parseStatus = (line: string): teststatus.TestStatus|undefined => {
      var matches =
          line.match(/(.*) \.\.\. (error|failure|failed|ok|skipped)/i);
      if (matches && matches.length >= 2) {
        var status = matches[2].toLowerCase();
        if (status == 'ok') {
          return teststatus.Passed;
        } else if (status == 'skipped') {
          return teststatus.Skipped;
        } else if (
            status == 'error' || status == 'failure' || status == 'failed') {
          return teststatus.Failed;
        }
      }
      return messages.length > 0 ? teststatus.Failed : teststatus.Idle;
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
         status: teststatus.TestStatus|undefined) => {
          if (status && node) {
            node.message = getMessage();
            let nodes = node.finish(status);
            if (status == teststatus.Failed) {
              error_nodes = error_nodes.concat(nodes);
            }
          }
        };
    let current_suite = root;
    let node: BanditTestNode|undefined;
    let last_indentation = 0;
    let status: teststatus.TestStatus|undefined;
    stdout = stdout.replace('\r\n', '\n');
    let lines = stdout.split(/[\n]+/);
    for (let line of lines) {
      if (line.length) {
        let indentation = line.search(/\S/);
        if (isGroup(line) || isTest(line)) {
          // Einrückung berücksichtigen:
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
    // Nachfolgende Fehlermeldungen verarbeiten:
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

  private updateFromString(node: BanditTestNode, stdout: string) {
    let parsed_result = this.createFromString(stdout);
    let result_node = parsed_result.find(node.id);
    if (result_node) {
      node.finish(result_node.status, result_node.message)
          .map(this.notifyStatus, this);
    }
  }

  private finish(
      node: BanditTestNode, status: teststatus.TestStatus, message?: string) {
    node.finish(status, message).map(this.notifyStatus, this);
  }

  private notifyStatus(node: BanditTestNode) {
    let e = this.getStatusEvent(node);
    if (e) {
      this.testStatesEmitter.fire(e);
      if (this.testsuite.status != teststatus.Running) {
        this.notifyFinished();
      }
    }
  }

  private notifyStart(nodes: Array<BanditTestNode>) {
    let ids = new Array<string>();
    for (let node of nodes) {
      ids.push(node.id);
      let group = asTestGroup(node);
      if (group) {
        let tests = group.tests;
        for (let test of tests) {
          ids.push(test.id);
        }
      }
    }
    this.testStatesEmitter.fire(
        <TestRunStartedEvent>{type: 'started', tests: ids});
  }

  private notifyFinished() {
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
    if (test.status == teststatus.Running) {
      status = 'running';
    } else if (test.status == teststatus.Passed) {
      status = 'passed';
    } else if (test.status == teststatus.Failed) {
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
    if (group.status == teststatus.Running) {
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