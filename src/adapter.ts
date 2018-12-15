import * as fs from 'fs'
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';
import {BanditSpawner, BanditSpawnerConfiguration} from './bandit'
import {VariableResolver} from './helper';
import {BanditTestSuite} from './testSuite'


class BanditConfiguration implements BanditSpawnerConfiguration {
  private resolver = new VariableResolver(this.workspaceFolder);
  // Konstruktor
  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {}

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'banditTestExplorer', this.workspaceFolder.uri);
  }

  public get cmd(): string {
    const configExe =
        this.resolver.resolve(this.config.get<string>('executable'));
    if (path.isAbsolute(configExe)) {
      return configExe;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configExe);
    }
  }

  public get cwd(): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const configCwd =
        this.resolver.resolve(this.config.get<string>('cwd', dirname));
    if (path.isAbsolute(configCwd)) {
      return configCwd;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configCwd);
    }
  }

  public get env(): NodeJS.ProcessEnv {
    const processEnv = process.env;
    const configEnv: {[prop: string]: any} = this.config.get('env') || {};

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

  public get args(): string[] {
    var args = this.config.get<string[]>('arguments');
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

  private config = new BanditConfiguration(this.workspaceFolder);
  private spawner = new BanditSpawner(this.config);
  // Testsuite
  private testSuite = new BanditTestSuite(
      this.testStatesEmitter, this.testsEmitter, this.spawner);

  // Konstruktor
  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private readonly log: Log) {
    this.log.info('Initializing bandit adapter');

    const executable = this.config.cmd;
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

  // Schnittstellen
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

  async load(): Promise<void> {
    this.log.info('Loading bandit tests');

    this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});
    if (this.testSuite) {
      this.testSuite.init().catch((e) => {
        this.log.error(e.message);
      });
    }
  }

  async run(tests: string[]): Promise<void> {
    this.log.info(`Running bandit tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{type: 'started', tests});
    if (this.testSuite) {
      try {
        await this.testSuite.start(tests);
      } catch (e) {
        this.log.error(e.message);
      }
    }
    this.testStatesEmitter.fire(<TestRunFinishedEvent>{type: 'finished'});
  }

  async debug(tests: string[]): Promise<void> {
    this.log.warn('debug() not implemented yet');
    await this.run(tests);
  }

  cancel(): void {
    this.testSuite.cancel();
    // this.spawner.killAll();
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
