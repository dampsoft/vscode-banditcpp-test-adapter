import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';
import {Log} from 'vscode-test-adapter-util';

import {BanditSpawner} from './bandit'
import * as config from './configuration'
import {BanditTestSuite} from './testsuite'
import * as watcher from './watch'


type Disposable = {
  dispose(): void
};

export class BanditTestAdapter implements TestAdapter {
  private disposables: Disposable[] = [];
  private watches: Disposable[] = [];

  // Emitters
  private readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  private readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly reloadEmitter = new vscode.EventEmitter<void>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();

  // Members
  private config: config.BanditConfiguration =
      new config.Configuration(this.workspaceFolder);
  private testSuites: BanditTestSuite[] = [];

  // Konstruktor
  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private readonly log: Log) {
    this.log.info('Initialisiere den Bandit Test-Adapter');
    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.reloadEmitter);
    this.disposables.push(this.autorunEmitter);
    this.createConfigWatch();
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

  public async load(): Promise<void> {
    this.log.info('Lade Bandit Tests');
    this.reset();
    this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});
    let promises = new Array<Promise<void>>();
    for (let testSuite of this.testSuites) {
      promises.push(testSuite.init());
    }
    try {
      await Promise.all(promises);
    } catch (e) {
      this.log.error(e.message);
    }
    let info: TestSuiteInfo =
        {id: 'root', label: 'root', type: 'suite', children: []};
    for (let testSuite of this.testSuites) {
      info.children.push(testSuite.getTestInfo());
    }
    this.testsEmitter.fire(
        <TestLoadFinishedEvent>{type: 'finished', suite: info});
  }

  public async run(tests: string[]): Promise<void> {
    this.log.info(`Starte Bandit Tests ${JSON.stringify(tests)}`);
    this.testStatesEmitter.fire(<TestRunStartedEvent>{type: 'started', tests});
    let promises = new Array<Promise<void>>();
    for (let testSuite of this.testSuites) {
      promises.push(testSuite.start(tests));
    }
    try {
      await Promise.all(promises);
    } catch (e) {
      this.log.error(e.message);
    }
    this.testStatesEmitter.fire(<TestRunFinishedEvent>{type: 'finished'});
  }

  public async debug(tests: string[]): Promise<void> {
    this.log.warn('Das Debugging ist noch nicht implementiert!');
    await this.run(tests);
  }

  public cancel() {
    for (let testsuite of this.testSuites) {
      testsuite.cancel();
    }
  }

  public dispose() {
    this.cancel();
    this.disp(this.disposables);
    this.disposables = [];
    this.disp(this.watches);
    this.watches = [];
  }

  private disp(disposables: Disposable[]) {
    for (const disposable of disposables) {
      disposable.dispose();
    }
  }

  private reset() {
    this.createAutorunWatches();
    let tempConfig = new config.Configuration(this.workspaceFolder);
    this.config = tempConfig;
    this.cancel();
    this.testSuites = [];
    for (let tsconfig of this.config.testsuites) {
      let testsuiteSpawner = new BanditSpawner(tsconfig, this.log);
      let testSuite = new BanditTestSuite(
          tsconfig.name, this.testStatesEmitter, testsuiteSpawner, this.log);
      this.testSuites.push(testSuite);
    }
  }

  private createConfigWatch() {
    let watch = vscode.workspace.onDidChangeConfiguration(configChange => {
      let affects = (property: config.Property): boolean => {
        return configChange.affectsConfiguration(
            this.config.fullname(property), this.workspaceFolder.uri);
      };
      if (this.config.properties.some(affects)) {
        this.load();
      }
    });
    this.disposables.push(watch);
  }

  private createAutorunWatches() {
    this.disp(this.watches);
    this.watches = [];
    let suiteconfigs = this.config.testsuites;
    let paths: string[];
    for (let suiteconfig of suiteconfigs) {
      paths = [];
      paths.push(suiteconfig.cmd);
      if (suiteconfig.autorunWatches) {
        for (let w of suiteconfig.autorunWatches) {
          paths.push(w);
        }
      }
      let w = new watcher.DisposableWatcher(
          paths,
          () => {
            this.log.info(`Beobachte Änderung an der Testumgebung ${
                suiteconfig.name}...`);
          },
          () => {
            this.log.info(`Änderung an der Testumgebung ${
                suiteconfig.name} erkannt. Führe Autorun aus.`);
            // Geänderte Testsuite für den folgenden Autorun markieren:
            // TODO:
            this.autorunEmitter.fire();
          },
          () => {
            this.log.error(`Beim Beobachten der Testumgebung ${
                suiteconfig.name} ist ein Fehler aufgetreten.`);
          });
      this.watches.push(w);
    }
  }
}
