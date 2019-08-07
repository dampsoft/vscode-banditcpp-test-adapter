import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';

import {sortString} from '../util/helper';

import {TestStatus, TestStatusFailed, TestStatusIdle, TestStatusPassed, TestStatusRunning, TestStatusSkipped} from './teststatus';

export type TestNodeType = 'test'|'suite';
export const TestNodeTypeTest: TestNodeType = 'test';
export const TestNodeTypeSuite: TestNodeType = 'suite';

export interface TestNodeI {
  readonly type: TestNodeType;
  readonly label: string;
  readonly status: TestStatus;
  readonly id: string
  start(): TestNodeI[];
  cancel(): TestNodeI[];
  finish(status: TestStatus, message?: string): TestNodeI[];
  readonly parents: Array<TestGroup>;
  getTestInfo(): TestSuiteInfo|TestInfo;
  readonly displayTitle: string;
  parent?: TestGroup;
  message?: string;
}

/**
 * Basis Test-Knoten
 */
abstract class TestNode implements TestNodeI {
  // Getter
  public abstract get type(): TestNodeType;
  public abstract get label(): string;
  public abstract get status(): TestStatus;
  public get id(): string {
    if (this.parent) {
      return `${this.parent.id}.${this.label}`;
    }
    return this.label;
  }
  // API
  public abstract start(): TestNodeI[];
  public abstract cancel(): TestNodeI[];
  public abstract finish(status: TestStatus, message?: string): TestNodeI[];
  // Konstruktor
  constructor(public parent: TestGroup|undefined) {}
  public get parents(): Array<TestGroup> {
    let parents = new Array<TestGroup>();
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
      return `${this.parent.displayTitle} ${this.label}`;
    } else {
      return '';
    }
  }
}

/************************************************************************/
/**
 * TestGroup-Klasse
 */
export class TestGroup extends TestNode {
  public children = new Array<TestNodeI>();
  public readonly type = TestNodeTypeSuite;

  constructor(
      parent: TestGroup|undefined,  //
      public label: string,         //
      public file?: string,         //
      public line?: number,         //
      public message?: string) {
    super(parent);
  }

  get status(): TestStatus {
    let aggr_status: TestStatus = TestStatusIdle;
    for (let node of this.children) {
      let node_status = node.status;
      if (node_status == TestStatusRunning) {
        return TestStatusRunning;
      } else if (node_status != TestStatusIdle) {
        if (aggr_status == TestStatusIdle) {
          aggr_status = node_status;
        } else if (node_status == TestStatusFailed) {
          aggr_status = TestStatusFailed;
        } else if (
            aggr_status == TestStatusSkipped &&
            node_status == TestStatusPassed) {
          aggr_status = TestStatusPassed;
        }
      }
    }
    return aggr_status;
  }

  public get tests(): Array<Test> {
    let test_children = new Array<Test>();
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

  public add(node: TestNodeI): TestNodeI {
    this.children.push(node);
    sortString(this.children, true, 'label');
    node.parent = this;
    return node;
  }

  public addTest(name: string, file?: string, line?: number, skipped?: boolean):
      Test {
    var test = new Test(this, name, file, line, skipped);
    this.add(test);
    return test;
  }

  public addSuite(name: string, file?: string, line?: number): TestGroup {
    var suite = new TestGroup(this, name, file, line);
    this.add(suite);
    return suite;
  }

  public findAll(id: string|RegExp): Array<TestNodeI> {
    var matches = new Array<TestNodeI>();
    if (typeof id === 'string' ? this.id === id : this.id.match(id)) {
      matches = this.tests;
    } else {
      for (var child of this.children) {
        if (typeof id === 'string' ? child.id === id : child.id.match(id)) {
          matches.push(child);
        } else {
          let group = asTestGroup(child);
          if (group) {
            matches = matches.concat(group.findAll(id));
          }
        }
      }
    }
    return matches;
  }

  public find(id: string|RegExp): TestNodeI|undefined {
    var matches = this.findAll(id);
    return matches ? matches[0] : undefined;
  }

  public findAllByLabel(label: string|RegExp): Array<TestNodeI> {
    var matches = new Array<TestNodeI>();
    for (var child of this.children) {
      if (typeof label === 'string' ? child.label === label :
                                      child.label.match(label)) {
        matches.push(child);
      }
    }
    return matches;
  }

  public findByLabel(label: string|RegExp): TestNodeI|undefined {
    var matches = this.findAllByLabel(label);
    return matches ? matches[0] : undefined;
  }

  public start(): TestNodeI[] {
    let nodes = new Array<TestNodeI>();
    for (var node of this.children) {
      nodes = nodes.concat(node.start());
    }
    return nodes;
  }

  public cancel(): TestNodeI[] {
    let nodes = new Array<TestNodeI>();
    for (var node of this.children) {
      nodes = nodes.concat(node.cancel());
    }
    return nodes;
  }

  public finish(status: TestStatus, message?: string): TestNodeI[] {
    let nodes = new Array<TestNodeI>();
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
export class Test extends TestNode {
  public readonly type = 'test';
  private test_status: TestStatus = TestStatusIdle;

  constructor(
      parent: TestGroup|undefined,  //
      public label: string,         //
      public file?: string,         //
      public line?: number,         //
      public skipped?: boolean,     //
      public message?: string) {
    super(parent);
  }

  public get status(): TestStatus {
    return this.test_status;
  }

  public start(): TestNode[] {
    let nodes = new Array<TestNode>();
    if (this.status !== TestStatusRunning) {
      this.test_status = TestStatusRunning;
      nodes.push(this);
    }
    return nodes;
  }

  public finish(status: TestStatus, message?: string): TestNode[] {
    let nodes = new Array<TestNode>();
    if (this.status !== status) {
      this.test_status = status;
      this.message = message;
      nodes.push(this);
    }
    return nodes;
  }

  public cancel(): TestNode[] {
    let nodes = new Array<TestNode>();
    if (this.status != TestStatusIdle) {
      if (this.status == TestStatusRunning) {
        this.test_status = TestStatusIdle;  // Reset the node state
        nodes.push(this);
      }
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

export function asTest(node: any): Test|undefined {
  return node instanceof Test ? (node as Test) : undefined;
}

export function asTestGroup(node: any): TestGroup|undefined {
  return node instanceof TestGroup ? (node as TestGroup) : undefined;
}
