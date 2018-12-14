import {SpawnOptions} from 'child_process';
import * as fs from 'fs'
import * as path from 'path';
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {resolveVariables} from './helper';
import {Spawner, SpawnReturns} from './spawner'
import * as bsuite from './testSuite'


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

  // Testsuite
  private testSuite = new bsuite.BanditTestSuite(
      this.testStatesEmitter, this.testsEmitter,
      (id: string): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
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
            reject(new Error(
                'Es wurde keine Bibliothek oder die Bandit-Test-Executable angegeben.'));
          }
          const executableArguments = this.getExecutableArguments(config);

          // Aufruf zusammenbauen
          var execArguments = new Array();
          execArguments.push('--reporter=spec');
          // Wegen Umlauten funktioniert das Filtern noch nicht!
          // execArguments.push('"--only=' + test.label + '"');
          execArguments.push('-testlib')
          execArguments.push(library);
          for (var arg of executableArguments) {
            execArguments.push(arg);
          }
          return this.spawner
              .spawnAsync(id, executable, execArguments, exec_options)
              .then((ret: SpawnReturns) => {
                if (ret.error) {
                  this.log.error(ret.error.message);
                }
                resolve(ret.stdout);
              });
        });
      });
  private spawner = new Spawner();

  // Konstruktor
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

    // Config lesen
    const config = this.getConfiguration();
    const executable = this.getExecutable(config);
    const library = this.getTestLibrary(config);
    const executableArguments = this.getExecutableArguments(config);
    if (!executable || !library) {
      return;
    }

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
            this.testSuite.initFromString(ret.stdout);
          } catch (e) {
            this.log.error(ret.error.message);
          }
        });
  }

  async run(tests: string[]): Promise<void> {
    this.log.info(`Running bandit tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{type: 'started', tests});
    if (this.testSuite) {
      try {
        this.testSuite.start(tests);
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
    this.spawner.killAll();
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  // private async spawnTest(id: string): Promise<string|undefined> {
  //   const config = this.getConfiguration();
  //   let exec_options: SpawnOptions = {
  //     cwd: this.getCwd(config),
  //     env: this.getEnv(config),
  //     shell: true,
  //     windowsVerbatimArguments: true
  //   };
  //   const executable = this.getExecutable(config);
  //   const library = this.getTestLibrary(config);
  //   if (!library || !executable) {
  //     return undefined;
  //   }
  //   const executableArguments = this.getExecutableArguments(config);

  //   // Aufruf zusammenbauen
  //   var execArguments = new Array();
  //   execArguments.push('--reporter=spec');
  //   // Wegen Umlauten funktioniert das Filtern noch nicht!
  //   // execArguments.push('"--only=' + test.label + '"');
  //   execArguments.push('-testlib')
  //   execArguments.push(library);
  //   for (var arg of executableArguments) {
  //     execArguments.push(arg);
  //   }
  //   return this.spawner.spawnAsync(id, executable, execArguments,
  //   exec_options)
  //       .then((ret: SpawnReturns) => {
  //         if (ret.error) {
  //           this.log.error(ret.error.message);
  //         }
  //         return ret.stdout;
  //       });
  // }

  private getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'banditTestExplorer', this.workspaceFolder.uri);
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
