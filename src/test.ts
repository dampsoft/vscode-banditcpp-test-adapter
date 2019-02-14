import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';

import {TestStatus, TestStatusFailed, TestStatusIdle, TestStatusPassed, TestStatusRunning, TestStatusSkipped} from './teststatus';

export type BanditTestNode = BanditTest|BanditTestGroup;

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
  public abstract get status(): TestStatus;
  public get id(): string {
    if (this.parent) {
      return `${this.parent.id}.${this.label}`;
    }
    return this.label;
  }
  // API
  public abstract start(): BanditTestNode[];
  public abstract cancel(): BanditTestNode[];
  public abstract finish(status: TestStatus, message?: string):
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
      return `${this.parent.displayTitle} ${this.label}`;
    } else {
      return '';
    }
  }
}

/************************************************************************/
/**
 * Testgroup-Klasse
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
    this.children.sort(
        (a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
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
      if (typeof id === 'string' ? child.id === id : child.id.match(id)) {
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
      if (typeof label === 'string' ? child.label === label :
                                      child.label.match(label)) {
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

  public cancel(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    for (var node of this.children) {
      nodes = nodes.concat(node.cancel());
    }
    return nodes;
  }

  public finish(status: TestStatus, message?: string): BanditTestNode[] {
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
  private test_status: TestStatus = TestStatusIdle;

  constructor(
      parent: BanditTestGroup|undefined,  //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public skipped?: boolean,           //
      public message?: string) {
    super(parent);
  }

  public get status(): TestStatus {
    return this.test_status;
  }

  public start(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status !== TestStatusRunning) {
      this.test_status = TestStatusRunning;
      nodes.push(this);
    }
    return nodes;
  }

  public finish(status: TestStatus, message?: string): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status !== status) {
      this.test_status = status;
      this.message = message;
      nodes.push(this);
    }
    return nodes;
  }

  public cancel(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
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

export function asTest(node: any): BanditTest|undefined {
  return node instanceof BanditTest ? (node as BanditTest) : undefined;
}

export function asTestGroup(node: any): BanditTestGroup|undefined {
  return node instanceof BanditTestGroup ? (node as BanditTestGroup) :
                                           undefined;
}
