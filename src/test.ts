import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as teststatus from './teststatus'

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
  public abstract get status(): teststatus.TestStatus;
  public get id(): string {
    if (this.parent) {
      return this.parent.id + '.' + this.label;
    }
    return this.label;
  }
  // API
  public abstract start(): BanditTestNode[];
  public abstract stop(): BanditTestNode[];
  public abstract finish(status: teststatus.TestStatus, message?: string):
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
      return (this.parent.displayTitle + ' ' + this.label).trim();
    } else {
      return '';
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

  get status(): teststatus.TestStatus {
    let aggr_status: teststatus.TestStatus = teststatus.Idle;
    for (let node of this.children) {
      let node_status = node.status;
      if (node_status == teststatus.Running) {
        return teststatus.Running;
      } else if (node_status != teststatus.Idle) {
        if (aggr_status == teststatus.Idle) {
          aggr_status = node_status;
        } else if (node_status == teststatus.Failed) {
          aggr_status = teststatus.Failed;
        } else if (
            aggr_status == teststatus.Skipped &&
            node_status == teststatus.Passed) {
          aggr_status = teststatus.Passed;
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

  public finish(status: teststatus.TestStatus, message?: string):
      BanditTestNode[] {
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
  private test_status: teststatus.TestStatus = teststatus.Idle;

  constructor(
      parent: BanditTestGroup|undefined,  //
      public label: string,               //
      public file?: string,               //
      public line?: number,               //
      public skipped?: boolean,           //
      public message?: string) {
    super(parent);
  }

  public get status(): teststatus.TestStatus {
    return this.test_status;
  }

  public start(): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (this.status !== teststatus.Running) {
      this.test_status = teststatus.Running;
      nodes.push(this);
    }
    return nodes;
  }

  public finish(status: teststatus.TestStatus, message?: string):
      BanditTestNode[] {
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
    if (this.status != teststatus.Idle) {
      this.test_status = teststatus.Skipped;
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


export function asTest(node: any): BanditTest|undefined {
  return node instanceof BanditTest ? node as BanditTest : undefined;
}

export function asTestGroup(node: any): BanditTestGroup|undefined {
  return node instanceof BanditTestGroup ? node as BanditTestGroup : undefined;
}