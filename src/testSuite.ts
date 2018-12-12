import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';


export class BanditTestSuiteInfo implements TestSuiteInfo {
  public readonly type: 'suite';
  public children: (BanditTestSuiteInfo|BanditTestInfo)[];
  public result?: 'passed'|'failed'|'skipped';
  constructor(
      public readonly id: string,  //
      public label: string,        //
      public file?: string,        //
      public line?: number         //
  ) {}

  public addTest(name: string, file?: string, line?: number, skipped?: boolean):
      BanditTestInfo {
    var test =
        new BanditTestInfo(this.id + '.' + name, name, file, line, skipped);
    this.children.push(test);
    return test;
  }

  public addSuite(name: string, file?: string, line?: number):
      BanditTestSuiteInfo {
    var suite = new BanditTestSuiteInfo(this.id + '.' + name, name, file, line);
    this.children.push(suite);
    return suite;
  }

  public findAll(id: string|RegExp): Array<BanditTestInfo|BanditTestSuiteInfo> {
    var matches = [];
    for (var child of this.children) {
      if (child.id.match(id)) {
        matches.push(child);
      } else {
        var child_suite = child as BanditTestSuiteInfo;
        if (child_suite) {
          matches.concat(child_suite.findAll(id));
        }
      }
    }
    return matches;
  }

  public find(id: string|RegExp): BanditTestInfo|BanditTestSuiteInfo|undefined {
    var matches = this.findAll(id);
    return matches ? matches[0] : undefined;
  }

  public start(): Array<BanditTestInfo> {
    var tests = [];
    for (var node of this.children) {
      let test = node as BanditTestInfo;
      if (test) {
        if (test.start()) {
          tests.push(test);
        }
      } else {
        let suite = node as BanditTestSuiteInfo;
        if (suite) {
          tests.concat(suite.start());
        }
      }
    }
    return tests;
  }

  public stop(): Array<BanditTestInfo> {
    var tests = [];
    for (var node of this.children) {
      let test = node as BanditTestInfo;
      if (test) {
        if (test.stop()) {
          tests.push(test);
        }
      } else {
        let suite = node as BanditTestSuiteInfo;
        if (suite) {
          tests.concat(suite.stop());
        }
      }
    }
    return tests;
  }
}

export class BanditTestInfo implements TestInfo {
  public readonly type: 'test';
  public result?: 'passed'|'failed'|'skipped';
  private status: 'idle'|'running';
  constructor(
      public readonly id: string,  //
      public label: string,        //
      public file?: string,        //
      public line?: number,        //
      public skipped?: boolean) {}

  public start(): boolean {
    var started = this.status != 'running'
    if (started) {
      this.status = 'running';
    }
    return started;
  }

  public stop(): boolean {
    var stopped = this.status != 'idle'
    if (stopped) {
      this.status = 'idle';
    }
    return stopped;
  }
}

export class BanditTestSuite {
  private testsuite = new BanditTestSuiteInfo('root', 'root');

  constructor(private readonly log: Log) {}

  public find(id: string|RegExp): BanditTestInfo|BanditTestSuiteInfo|undefined {
    return this.testsuite.find(id);
  }

  public findAll(id: string|RegExp): Array<BanditTestInfo|BanditTestSuiteInfo> {
    return this.testsuite.findAll(id);
  }

  public startTest(id: string): Array<BanditTestInfo> {
    var started = [];
    let r = new RegExp('^' + id + '$');
    let nodes = this.findAll(r);
    for (var node of nodes) {
      let test = node as BanditTestInfo;
      if (test) {
        if (test.start()) {
          started.push(test);
        }
      } else {
        let suite = node as BanditTestSuiteInfo;
        if (suite) {
          started.concat(suite.start());
        }
      }
    }
    return started;
  }

  public cancel() {
    this.testsuite.stop();
  }
}
