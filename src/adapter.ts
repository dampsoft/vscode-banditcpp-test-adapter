import {ChildProcess, execFile, ExecFileOptionsWithBufferEncoding} from 'child_process';
import * as fs from 'fs'
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestInfo, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js'
import {resolveVariables} from './helper';

export class BanditTestAdapter implements TestAdapter {
  private readonly testStatesEmitter =
      new vscode.EventEmitter<TestSuiteEvent|TestEvent>();
  private readonly reloadEmitter = new vscode.EventEmitter<void>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private readonly _variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath]
  ];

  private runningTestProcess: ChildProcess|undefined;

  get testStates(): vscode.Event<TestSuiteEvent|TestEvent> {
    return this.testStatesEmitter.event;
  }

  get reload(): vscode.Event<void> {
    return this.reloadEmitter.event;
  }

  get autorun(): vscode.Event<void> {
    return this.autorunEmitter.event;
  }

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    const config = this.getConfiguration();
    const executable = this.getExecutable(config);
    if (executable) {
      fs.watchFile(executable, (curr: any, prev: any) => {
        console.log(`the current mtime is: ${curr.mtime}`);
        console.log(`the previous mtime was: ${prev.mtime}`);
        this.autorunEmitter.fire();
      });
    }
  }

  async load(): Promise<TestSuiteInfo|undefined> {
    const config = this.getConfiguration();

    return await new Promise<TestSuiteInfo|undefined>((resolve, reject) => {

      const executable = this.getExecutable(config);
      if (!executable) {
        resolve();
        return;
      }
      const library = this.getTestLibrary(config);
      if (!library) {
        resolve();
        return;
      }
      const executableArguments = this.getExecutableArguments(config);

      // Aufruf zusammenbauen
      var execArguments = new Array();
      execArguments.push(['--dry-run', '--reporter=spec']);
      execArguments.push(['-testlib', library]);
      if (executableArguments.length > 0) {
        execArguments.push(executableArguments);
      }

      execFile(
          executable, execArguments, (error: any, stdout: any, stderr: any) => {
            if (error) {
              reject(error);
            } else {
              var allTestsSuite = this.makeSuite('AllTests', 'AllTests');
              var current_suite = allTestsSuite;
              let lines = stdout.split(/[\n\r]+/);
              for (var line of lines) {
                line = line.trim();
                if (line.startsWith('describe')) {
                  var name = line.slice('describe'.length).trim();
                  current_suite = this.makeSuite(name, name);
                  allTestsSuite.children.push(current_suite);
                } else {
                  var matches = line.match(/(?<=- it ).*(?= \.\.\.)/ig);
                  if (matches.length) {
                    var test_name = matches[0].trim();
                    var test_info = this.makeTest(
                        current_suite.id + '.' + test_name, test_name);
                    current_suite.children.push(test_info);
                  }
                }
              }
              resolve(allTestsSuite);
            }
          });
    });
  }

  async run(info: TestSuiteInfo|TestInfo): Promise<void> {
    const config = this.getConfiguration();

    this.testStatesEmitter.fire(
        <TestSuiteEvent>{type: 'suite', suite: 'AllTests', state: 'running'});

    let report_failure = (reject: (reason?: any) => void, error: any) => {
      this.testStatesEmitter.fire(<TestSuiteEvent>{
        type: 'suite',
        suite: 'AllTests',
        state: 'completed'
      });

      this.setTestStatesRecursive(info, 'failed', error);

      this.runningTestProcess = undefined;
      reject(error);
    };

    await new Promise<void>((resolve, reject) => {
      let exec_options: ExecFileOptionsWithBufferEncoding = {
        cwd: this.getCwd(config),
        env: this.getEnv(config),
        encoding: 'buffer'
      };

      const executable = this.getExecutable(config);
      if (!executable) {
        resolve();
        return;
      }
      const library = this.getTestLibrary(config);
      if (!library) {
        resolve();
        return;
      }
      const executableArguments = this.getExecutableArguments(config);

      // Aufruf zusammenbauen
      var execArguments = new Array();
      execArguments.push(['--reporter=spec']);
      if (info.name) {
        execArguments.push(['--only', info.name]);
      }
      execArguments.push(['-testlib', library]);
      if (executableArguments.length > 0) {
        execArguments.push(executableArguments);
      }

      this.runningTestProcess = execFile(
          executable, execArguments, exec_options,
          (error: any, stdout: any, stderr: any) => {
            if (error) {
              report_failure(reject, error);
            } else {
              var allTestsSuite = this.makeSuite('AllTests', 'AllTests');
              var current_suite = undefined;
              var current_test = undefined;
              let lines = stdout.split(/[\n\r]+/);
              let messages = Array<String>();
              for (var line of lines) {
                let line_trimmed = line.trim();
                if (line_trimmed.startsWith('describe')) {
                  // Alten Test beenden?
                  if (current_test) {
                    let passed = messages.length == 0;
                    this.testStatesEmitter.fire(<TestEvent>{
                      type: 'test',
                      test: current_test.id,
                      state: passed ? 'passed' : 'failed',
                      message: passed ? null : messages.join('\n')
                    });
                  }
                  current_test = undefined;
                  messages = [];
                  if (current_suite) {
                    this.testStatesEmitter.fire(<TestSuiteEvent>{
                      type: 'suite',
                      suite: current_suite.id,
                      state: 'completed'
                    });
                  }
                  var name = line_trimmed.slice('describe'.length).trim();
                  current_suite = this.makeSuite(name, name);
                  allTestsSuite.children.push(current_suite);
                  this.testStatesEmitter.fire(<TestSuiteEvent>{
                    type: 'suite',
                    suite: current_suite.id,
                    state: 'running'
                  });
                } else if (line_trimmed.startsWith('- it')) {
                  // Alten Test beenden?
                  if (current_test) {
                    let passed = messages.length == 0;
                    this.testStatesEmitter.fire(<TestEvent>{
                      type: 'test',
                      test: current_test.id,
                      state: passed ? 'passed' : 'failed',
                      message: passed ? null : messages.join('\n')
                    });
                  }
                  messages = [];
                  var testname_matches =
                      line_trimmed.match(/(?<=- it).*(?= \.\.\.)/ig);
                  if (testname_matches.length) {
                    var test_name = testname_matches[0].trim();
                    current_test = this.makeTest(
                        current_suite.id + '.' + test_name, test_name);
                    this.testStatesEmitter.fire(<TestEvent>{
                      type: 'test',
                      test: current_test.id,
                      state: 'running'
                    });

                    var result_matches = line_trimmed.match(
                        /(?<=\.\.\.)[ ]*(error|failure|ok|skipped)[ ]*$/i);
                    if (result_matches) {
                      let passed = line_trimmed.toLowerCase().contains('ok') ||
                          line_trimmed.toLowerCase().contains('skipped');
                      this.testStatesEmitter.fire(<TestEvent>{
                        type: 'test',
                        test: current_test.id,
                        state: passed ? 'passed' : 'failed',
                        message: passed ? null : messages.join('\n')
                      });
                    }
                  }
                } else {
                  messages.push(line);
                }
              }
              // Alten Test beenden?
              if (current_test) {
                let passed = messages.length == 0;
                this.testStatesEmitter.fire(<TestEvent>{
                  type: 'test',
                  test: current_test.id,
                  state: passed ? 'passed' : 'failed',
                  message: passed ? null : messages.join('\n')
                });
              }

              this.testStatesEmitter.fire(<TestSuiteEvent>{
                type: 'suite',
                suite: 'AllTests',
                state: 'completed'
              });

              this.runningTestProcess = undefined;
              resolve();
            }
          });
    });
  }

  async debug(info: TestSuiteInfo|TestInfo): Promise<void> {
    throw new Error('Method not implemented.');
  }

  cancel(): void {
    if (this.runningTestProcess) {
      this.runningTestProcess.kill();
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
    return config.get<string[]>('arguments');
  }

  private setTestStatesRecursive(
      info: TestSuiteInfo|TestInfo,
      state: 'running'|'passed'|'failed'|'skipped',
      message?: string|undefined) {
    if (info.type == 'suite') {
      info.children.forEach(
          child => this.setTestStatesRecursive(child, state, message));
    } else {
      this.testStatesEmitter.fire(<TestEvent>{
        type: 'test',
        test: info.id,
        state: state,
        message: message
      });
    }
  }
}
