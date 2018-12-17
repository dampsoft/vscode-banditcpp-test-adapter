import * as fs from 'fs'
import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';
import {BanditSpawner} from './bandit'
import {BanditConfiguration} from './configuration'
import {BanditTestSuite} from './testsuite'


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

  // Members
  private config = new BanditConfiguration(this.workspaceFolder);
  private spawner = new BanditSpawner(this.config);
  private testSuite = new BanditTestSuite(this.testStatesEmitter, this.spawner);

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
    this.cancel();
    this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});
    if (this.testSuite) {
      try {
        await this.testSuite.init();
      } catch (e) {
        this.log.error(e.message);
      }
    }
    this.testsEmitter.fire(<TestLoadFinishedEvent>{
      type: 'finished',
      suite: this.testSuite.getTestInfo()
    });
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
    this.log.warn('debugging not implemented yet');
    await this.run(tests);
  }

  cancel(): void {
    this.testSuite.cancel();
  }

  dispose(): void {
    this.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
