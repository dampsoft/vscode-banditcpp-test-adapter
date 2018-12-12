import {SpawnOptions} from 'child_process';
import * as fs from 'fs'
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestInfo, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {resolveVariables} from './helper';
import {Spawner, SpawnReturns} from './spawner'


export class BanditTestAdapter implements TestAdapter {
  private disposables: {dispose(): void}[] = [];

  // Emitters
  private readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  private readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly reloadEmitter = new vscode.EventEmitter<void>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  private readonly _variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath]
  ];

  private testSuite: TestSuiteInfo|undefined;
  private spawner = new Spawner();

  get tests(): vscode.Event<TestLoadStartedEvent|TestLoadFinishedEvent> {
    return this.testsEmitter.event;
  }

  get testStates(): vscode.Event<TestRunStartedEvent|TestRunFinishedEvent|
                                 TestSuiteEvent|TestEvent> {
    return this.testStatesEmitter.event;
  }

  get reload(): vscode.Event<void> {
    return this.reloadEmitter.event;
  }

  get autorun(): vscode.Event<void> {
    return this.autorunEmitter.event;
  }

  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private readonly log: Log) {
    this.log.info('Initializing bandit adapter');

    const config = this.getConfiguration();
    const executable = this.getExecutable(config);
    if (executable) {
      fs.watchFile(executable, (curr: any, prev: any) => {
        console.log(`the current mtime is: ${curr.mtime}`);
        console.log(`the previous mtime was: ${prev.mtime}`);
        this.autorunEmitter.fire();
      });
    }

    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.reloadEmitter);
    this.disposables.push(this.autorunEmitter);
  }

  async load(): Promise<void> {
    this.log.info('Loading bandit tests');

    this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});

    const config = this.getConfiguration();

    const executable = this.getExecutable(config);
    if (!executable) {
      return;
    }
    const library = this.getTestLibrary(config);
    if (!library) {
      return;
    }
    const executableArguments = this.getExecutableArguments(config);

    // Aufruf zusammenbauen
    var execArguments = new Array();
    execArguments.push('--dry-run');
    execArguments.push('--reporter=spec');
    execArguments.push('-testlib')
    execArguments.push(library);
    for (var arg of executableArguments) {
      execArguments.push(arg);
    }
    let exec_options: SpawnOptions = {
      cwd: this.getCwd(config),
      env: this.getEnv(config),
      shell: true,
      windowsVerbatimArguments: true
    };
    return this.spawner
        .spawnAsync('AllTests', executable, execArguments, exec_options)
        .then((ret: SpawnReturns) => {
          try {
            var allTestsSuite = this.makeSuite('AllTests', 'AllTests');
            var current_suite = allTestsSuite;
            let lines = ret.stdout.split(/[\n]+/);
            for (var line of lines) {
              line = line.trim();
              if (line.startsWith('describe')) {
                var name = line.slice('describe'.length).trim();
                current_suite = this.makeSuite(name, name);
                allTestsSuite.children.push(current_suite);
              } else {
                var matches = line.match(/- it.*\.\.\./i);
                if (matches) {
                  var test_name =
                      matches[0].replace(/- it(.*)\.\.\./i, '\$1').trim();
                  var test_info = this.makeTest(
                      current_suite.id + '.' + test_name, test_name);
                  current_suite.children.push(test_info);
                }
              }
            }
            this.testSuite = allTestsSuite;
            this.testsEmitter.fire(<TestLoadFinishedEvent>{
              type: 'finished',
              suite: this.testSuite
            });
          } catch (e) {
            this.log.error(ret.error.message);
            throw e;
          }
        });
  }

  async run(tests: string[]): Promise<void> {
    this.log.info(`Running bandit tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{type: 'started', tests});
    if (this.testSuite) {
      for (var suiteOrTestId of tests) {
        var test = this.findNode(this.testSuite, suiteOrTestId);
        if (test) {
          await this.runNode(test);
        }
      }
    }
  }

  async debug(tests: string[]): Promise<void> {
    this.log.warn('debug() not implemented yet');
    await this.run(tests);
  }

  cancel(): void {
    this.spawner.killAll();
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private findNode(
      searchNode: TestSuiteInfo|TestInfo, id: string,
      type?: 'suite'|'test'): TestSuiteInfo|TestInfo|undefined {
    if (searchNode.id === id && (!type || type == searchNode.type)) {
      return searchNode;
    } else if (searchNode.type === 'suite') {
      for (const child of searchNode.children) {
        const found = this.findNode(child, id, type);
        if (found) return found;
      }
    }
    return undefined;
  }


  private async runNode(node: TestSuiteInfo|TestInfo): Promise<void> {
    if (node.type === 'suite') {
      this.testStatesEmitter.fire(
          <TestSuiteEvent>{type: 'suite', suite: node.id, state: 'running'});
      for (const child of node.children) {
        await this.runNode(child);
      }
      this.testStatesEmitter.fire(
          <TestSuiteEvent>{type: 'suite', suite: node.id, state: 'completed'});

    } else {
      await this.spawnTest(node);
    }
  }

  private async spawnTest(test: TestInfo): Promise<void> {
    var suite = this.testSuite;
    if (!suite) {
      return;
    }
    var test = this.findNode(suite, test.id) as TestInfo;
    if (!test) {
      return;
    }

    const config = this.getConfiguration();
    let exec_options: SpawnOptions = {
      cwd: this.getCwd(config),
      env: this.getEnv(config),
      shell: true,
      windowsVerbatimArguments: true
    };
    const executable = this.getExecutable(config);
    const library = this.getTestLibrary(config);
    if (!library || !executable) {
      return;
    }
    const executableArguments = this.getExecutableArguments(config);

    // Aufruf zusammenbauen
    var execArguments = new Array();
    execArguments.push('--reporter=spec');
    // execArguments.push('"--only=' + test.label + '"'); // Wegen umlauten
    // funktioniert es noch nicht!
    execArguments.push('-testlib')
    execArguments.push(library);
    for (var arg of executableArguments) {
      execArguments.push(arg);
    }
    this.testStatesEmitter.fire(
        <TestSuiteEvent>{type: 'suite', suite: suite.id, state: 'running'});
    this.testStatesEmitter.fire(
        <TestEvent>{type: 'test', test: test.id, state: 'running'});
    return this.spawner
        .spawnAsync(test.id, executable, execArguments, exec_options)
        .then((ret: SpawnReturns) => {
          if (this.testSuite) {
            var current_suite: TestSuiteInfo|undefined = this.testSuite;
            var current_test: TestInfo|undefined = undefined;
            var status: string|undefined = undefined;
            let lines = ret.stdout.split(/[\n\r]+/);
            let messages = Array<String>();
            for (var line of lines) {
              let line_trimmed = line.trim();
              status = this.parseResult(line_trimmed);
              if (!status) {
                status = messages.length > 0 ? 'failed' : 'skipped';
              }
              if (line_trimmed.startsWith('describe')) {
                current_test = undefined;
                messages = [];
                let suite_id =
                    line_trimmed.replace(/describe(.*)/i, '\$1').trim();
                current_suite =
                    this.findNode(this.testSuite, suite_id, 'suite') as
                    TestSuiteInfo;
              } else if (current_suite && line_trimmed.startsWith('- it ')) {
                messages = [];
                var test_name =
                    line_trimmed.replace(/- it (.*)\.\.\..*/i, '\$1').trim();
                let test_id = current_suite.id + '.' + test_name;
                if (test.id == test_id) {
                  current_test =
                      this.findNode(current_suite, test_id, 'test') as TestInfo;
                  if (current_test && status) {
                    this.testStatesEmitter.fire(<TestEvent>{
                      type: 'test',
                      test: current_test.id,
                      state: status,
                      message: messages.join('\n')
                    });
                  }
                }
              } else if (current_test) {
                messages.push(line);
              }
            }
            // Alten Test beenden?
            if (current_test && status) {
              this.testStatesEmitter.fire(<TestEvent>{
                type: 'test',
                test: current_test.id,
                state: status,
                message: messages.join('\n')
              });
            }

            this.testStatesEmitter.fire(
                <TestRunFinishedEvent>{type: 'finished'});
          }
        });
  }

  private parseResult(line: string): string|undefined {
    var matches =
        line.match(/(.*)[ ]+\.\.\.[ ]+(error|failure|ok|skipped)[ ]*$/i);
    if (matches && matches.length >= 2) {
      var status = matches[2].toLowerCase();
      if (status == 'ok') {
        return 'passed';
      } else if (status == 'skipped') {
        return 'skipped';
      } else if (status == 'error' || status == 'failure') {
        return 'failed';
      }
    }
    return undefined;
  }

  private updateTest(id: String): void {
    var node = this.findNode(this.testSuite, id);
    var suite = node as TestSuiteInfo;
    if (suite) {
      suite.
    } else {
      var test = node as TestInfo;
    }
  }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'banditTestExplorer', this.workspaceFolder.uri);
  }

  private makeSuite(suite_id: string, suite_name: string): TestSuiteInfo {
    return {type: 'suite', id: suite_id, label: suite_name, children: []};
  }

  private makeTest(test_id: string, test_name: string): TestInfo {
    return {type: 'test', id: test_id, label: test_name};
  }

  private getEnv(config: vscode.WorkspaceConfiguration): NodeJS.ProcessEnv {
    const processEnv = process.env;
    const configEnv: {[prop: string]: any} = config.get('env') || {};

    const resultEnv = {...processEnv};

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if ((val === undefined) || (val === null)) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = String(val);
      }
    }

    return resultEnv;
  }

  private getCwd(config: vscode.WorkspaceConfiguration): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const configCwd = resolveVariables(
        config.get<string>('cwd', dirname), this._variableToValue);
    if (path.isAbsolute(configCwd)) {
      return configCwd;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configCwd);
    }
  }

  private getExecutable(config: vscode.WorkspaceConfiguration): string {
    const configExe = resolveVariables(
        config.get<string>('executable'), this._variableToValue);
    if (path.isAbsolute(configExe)) {
      return configExe;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configExe);
    }
  }

  private getTestLibrary(config: vscode.WorkspaceConfiguration): string {
    const configLib =
        resolveVariables(config.get<string>('library'), this._variableToValue);
    if (path.isAbsolute(configLib)) {
      return configLib;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configLib);
    }
  }

  private getExecutableArguments(config: vscode.WorkspaceConfiguration):
      Array<string> {
    var args = config.get<string[]>('arguments');
    if (args) {
      var args_modified = new Array<string>();
      for (let arg of args) {
        if (arg.trim().length > 0) {
          if (arg.trim().indexOf(' ') >= 0) {
            arg = '"' + arg.trim() + '"';
          }
          args_modified.push(arg.trim());
        }
      }
      return args_modified;
    } else {
      return [];
    }
  }
}
