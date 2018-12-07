import {ChildProcess, execFile, ExecFileOptionsWithBufferEncoding} from 'child_process';
import * as fs from 'fs'
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestInfo, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import * as xml2js from 'xml2js'

export class BanditTestAdapter implements TestAdapter {
  private readonly testStatesEmitter =
      new vscode.EventEmitter<TestSuiteEvent|TestEvent>();
  private readonly reloadEmitter = new vscode.EventEmitter<void>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

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
      fs.watchFile(executable, (curr, prev) => {
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

      execFile(executable, ['--gtest_list_tests'], (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          let lines = stdout.split(/[\n\r]+/);
          var allTestsSuite = this.makeSuite('AllTests', 'AllTests');

          var current_suite = allTestsSuite;
          for (var line of lines) {
            if (line[0] == ' ') {
              let test_name = line.trim().split(' ')[0];
              var test_info =
                  this.makeTest(current_suite.id + '.' + test_name, test_name);
              current_suite.children.push(test_info);
            } else if (line.endsWith('.')) {
              let name = line.slice(0, line.length - 1);
              current_suite = this.makeSuite(name, name);
              allTestsSuite.children.push(current_suite);
            }  // else ignore the line
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
      let filter = info.id == 'AllTests' ? '*' : info.id + '*';
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
      this.runningTestProcess = execFile(
          executable, ['--gtest_filter=' + filter, '--gtest_output=xml'],
          exec_options, (error, stdout, stderr) => {
            if (error) {
              report_failure(reject, error);
            } else {
              const test_details =
                  path.resolve(this.getCwd(config), 'test_detail.xml');
              if (!fs.existsSync(test_details)) {
                reject('Test run did not generate any output.');
              } else {
                let parser = new xml2js.Parser();
                fs.readFile(test_details, 'utf8', (err, data) => {

                  if (err) {
                    report_failure(reject, err);
                  } else {
                    parser.parseString(data, (err: any, result: any) => {

                      if (err) {
                        report_failure(reject, err);
                      } else {
                        for (var suite of result.testsuites.testsuite) {
                          const suite_id = suite.$.name;

                          this.testStatesEmitter.fire(<TestSuiteEvent>{
                            type: 'suite',
                            suite: suite_id,
                            state: 'running'
                          });

                          for (var test of suite.testcase) {
                            let messages = [];
                            const test_id =
                                test.$.classname + '.' + test.$.name;

                            this.testStatesEmitter.fire(<TestEvent>{
                              type: 'test',
                              test: test_id,
                              state: 'running'
                            });

                            if ('failure' in test) {
                              for (var failure of test.failure) {
                                messages.push(failure._);
                              }
                            }

                            let passed = messages.length == 0;
                            this.testStatesEmitter.fire(<TestEvent>{
                              type: 'test',
                              test: test_id,
                              state: passed ? 'passed' : 'failed',
                              message: passed ? null : messages.join('\n')
                            });
                          }

                          this.testStatesEmitter.fire(<TestSuiteEvent>{
                            type: 'suite',
                            suite: suite_id,
                            state: 'completed'
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
                  }
                });
              }
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
    const configCwd = config.get<string>('cwd');
    return configCwd ? path.resolve(dirname, configCwd) : dirname;
  }

  private getExecutable(config: vscode.WorkspaceConfiguration): string|null {
    const dirname = this.workspaceFolder.uri.fsPath;
    const configExe = config.get<string>('executable');
    return configExe ? path.resolve(dirname, configExe) : null;
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
