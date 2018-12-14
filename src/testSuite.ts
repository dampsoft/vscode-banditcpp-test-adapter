// import {Log} from 'vscode-test-adapter-util';
import * as vscode from 'vscode';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

import * as helper from './helper'

export type BanditTestStatus = 'idle'|'running'|'ok'|'failed'|'skipped';
export const BanditTestStatusIdle: BanditTestStatus = 'idle';
export const BanditTestStatusRunning: BanditTestStatus = 'running';
export const BanditTestStatusPassed: BanditTestStatus = 'ok';
export const BanditTestStatusFailed: BanditTestStatus = 'failed';
export const BanditTestStatusSkipped: BanditTestStatus = 'skipped';

export type BanditTestType = 'test'|'suite';
export const Test: BanditTestType = 'test';
export const Suite: BanditTestType = 'suite';

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
  public abstract start(): void;
  public abstract stop(): void;
  public abstract finish(status: BanditTestStatus, message?: string): void;
  // Konstruktor
  constructor(
      public parent: BanditTestGroup|undefined,
      public suite: TestSuite|undefined) {}
  protected notify(node: TestNode = this) {
    if (this.suite) {
      this.suite.notifyTestRunStatus(node);
    } else if (this.parent) {
      this.parent.notify(node);
    }
  }
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

/**
 * Testsuite-Klasse
 */
export class BanditTestGroup extends TestNode {
  public children = new Array<BanditTestGroup|BanditTestInfo>();
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

  public get tests(): Array<BanditTestInfo> {
    let test_children = new Array<BanditTestInfo>();
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

  public add(node: BanditTestInfo|BanditTestGroup): BanditTestInfo
      |BanditTestGroup {
    this.children.push(node);
    node.parent = this;
    return node;
  }

  public addTest(name: string, file?: string, line?: number, skipped?: boolean):
      BanditTestInfo {
    var test = new BanditTestInfo(this, this.suite, name, file, line, skipped);
    this.add(test);
    return test;
  }

  public addSuite(name: string, file?: string, line?: number): BanditTestGroup {
    var suite = new BanditTestGroup(this, this.suite, name, file, line);
    this.add(suite);
    return suite;
  }

  public findAll(id: string|RegExp): Array<BanditTestInfo|BanditTestGroup> {
    var matches = new Array<BanditTestInfo|BanditTestGroup>();
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

  public find(id: string|RegExp): BanditTestInfo|BanditTestGroup|undefined {
    var matches = this.findAll(id);
    return matches ? matches[0] : undefined;
  }

  public findAllByLabel(label: string|RegExp):
      Array<BanditTestInfo|BanditTestGroup>|undefined {
    var matches = new Array<BanditTestInfo|BanditTestGroup>();
    for (var child of this.children) {
      if (child.label.match(label)) {
        matches.push(child);
      }
    }
    return matches;
  }

  public findByLabel(label: string|RegExp): BanditTestInfo|BanditTestGroup
      |undefined {
    var matches = this.findAllByLabel(label);
    return matches ? matches[0] : undefined;
  }

  public start() {
    for (var node of this.children) {
      let test = asTest(node);
      if (test) {
        test.start();
      } else {
        let group = asTestGroup(node);
        if (group) {
          group.start();
        }
      }
    }
    this.notify();
  }

  public stop(): Array<BanditTestInfo> {
    var tests = new Array<BanditTestInfo>();
    for (var node of this.children) {
      let test = asTest(node);
      if (test) {
        if (test.stop()) {
          tests.push(test);
        }
      } else {
        let group = asTestGroup(node);
        if (group) {
          tests = tests.concat(group.stop());
        }
      }
    }
    return tests;
  }

  public finish(status: BanditTestStatus, message?: string) {
    for (let child of this.children) {
      child.finish(status);
    }
    this.message = message;
    this.notify();
  }
}

/**
 * Test Klasse
 */
export class BanditTestInfo extends TestNode {
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

  public async start() {
    var started = this.status !== BanditTestStatusRunning;
    if (started) {
      this.test_status = BanditTestStatusRunning;
      this.notify();
    }
    return started;
  }

  public finish(status: BanditTestStatus, message?: string) {
    this.test_status = status;
    this.message = message;
    this.notify();
  }

  public stop(): boolean {
    var stopped = this.status != BanditTestStatusIdle
    if (stopped) {
      this.test_status = BanditTestStatusSkipped;
    }
    return stopped;
  }
}

interface TestSuite {
  notifyTestRunStatus(node: TestNode): void
}

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
      private spawner: (id: string) => Promise<string|undefined>) {}

  public initFromString(stdout: string) {
    this.testsuite = this.createFromString(stdout);
    this.testsuite.suite = this;
    let info = this.getGroupStatusInfo(this.testsuite);
    this.testsEmitter.fire(
        <TestLoadFinishedEvent>{type: 'finished', suite: info});
  }

  private createFromString(stdout: string): BanditTestGroup {
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
      var matches =
          line.match(/(.*)[ ]+\.\.\.[ ]+(error|failure|ok|skipped)[ ]*$/i);
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
        (node: BanditTestInfo|BanditTestGroup|undefined,
         status: BanditTestStatus|undefined) => {
          if (status && node) {
            node.message = getMessage();
            node.finish(status);
          }
        };
    let current_suite = root;
    let node: BanditTestInfo|BanditTestGroup|undefined;
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
              // Error
              // TODO
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
    return root;
  }

  public updateFromString(node: TestNode, stdout: string) {
    let result_suite = this.createFromString(stdout);
    let result_node = result_suite.find(node.id);
    if (result_node) {
      node.finish(result_node.status, result_node.message);
    }
  }

  public add(node: BanditTestInfo|BanditTestGroup): BanditTestInfo
      |BanditTestGroup {
    return this.testsuite.add(node);
  }

  public addTest(name: string, file?: string, line?: number, skipped?: boolean):
      BanditTestInfo {
    return this.testsuite.addTest(name, file, line, skipped);
  }

  public addSuite(name: string, file?: string, line?: number): BanditTestGroup {
    return this.testsuite.addSuite(name, file, line);
  }

  public find(id: string|RegExp): BanditTestInfo|BanditTestGroup|undefined {
    return this.testsuite.find(id);
  }

  public findAll(id: string|RegExp): Array<BanditTestInfo|BanditTestGroup> {
    return this.testsuite.findAll(id);
  }

  get root(): BanditTestGroup {
    return this.testsuite;
  }

  public async start(ids: string[]): Promise<void> {
    let nodes = new Array<BanditTestGroup|BanditTestInfo>();
    let unique_ids = new Set<string>(ids);
    for (let id of unique_ids) {
      let r = new RegExp(helper.escapeRegExp(id));  // ggf. ^id$
      nodes = nodes.concat(this.findAll(r));
    }
    if (this.testsuite.status != BanditTestStatusRunning) {
      this.notifyTestRunStart(nodes);
    }
    for (let node of nodes) {
      node.start();
      if (asTest(node)) {
        await this.spawner(node.id).then((ret: string|undefined) => {
          if (ret) {
            this.updateFromString(node, ret);
          } else {
            node.finish(BanditTestStatusFailed);
          }
        });
      }
    }
  }

  public cancel() {
    this.testsuite.stop();
  }

  public finish(
      node: BanditTestInfo|BanditTestGroup, status: BanditTestStatus,
      message?: string) {
    node.finish(status, message);
  }

  public notifyTestRunStatus(node: BanditTestInfo|BanditTestGroup) {
    let e = this.getStatusEvent(node);
    if (e) {
      this.testStatesEmitter.fire(e);
      if (this.testsuite.status != BanditTestStatusRunning) {
        this.notifyTestRunFinished();
      }
    }
  }

  private notifyTestRunStart(nodes: Array<BanditTestInfo|BanditTestGroup>) {
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

  private getStatusInfo(node: BanditTestInfo|BanditTestGroup): TestInfo
      |TestSuiteInfo|undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusInfo(test);
    } else if (group) {
      return this.getGroupStatusInfo(group);
    }
    return undefined;
  }

  private getTestStatusInfo(test: BanditTestInfo): TestInfo {
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

  private getStatusEvent(node: BanditTestInfo|BanditTestGroup): TestEvent
      |TestSuiteEvent|undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusEvent(test);
    } else if (group) {
      return this.getGroupStatusEvent(group);
    }
    return undefined;
  }

  private getTestStatusEvent(test: BanditTestInfo): TestEvent {
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

export function asTest(node: any): BanditTestInfo|undefined {
  return node instanceof BanditTestInfo ? node as BanditTestInfo : undefined;
}

export function asTestGroup(node: any): BanditTestGroup|undefined {
  return node instanceof BanditTestGroup ? node as BanditTestGroup : undefined;
}