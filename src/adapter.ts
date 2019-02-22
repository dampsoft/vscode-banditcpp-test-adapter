import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';

import {Configuration, Property} from './configuration/configuration';
import {closeLoadingProgress, LoadingProgress, showLoadingProgress, updateLoadingProgress} from './progress/loading'
import {closeRunningProgress, RunningProgress, showRunningProgress, updateRunningProgress} from './progress/running'
import {asTest, asTestGroup, Test, TestGroup, TestNodeI} from './project/test';
import {TestStatusFailed, TestStatusIdle, TestStatusPassed, TestStatusRunning, TestStatusSkipped} from './project/teststatus';
import {BanditTestSuite} from './project/testsuite';
import {DisposableI} from './util/disposable';
import {escapeRegExp, flatten} from './util/helper';
import {Logger} from './util/logger';
import {Message} from './util/message';

/**
 * Test-Adapterklasse für Bandittests
 */
export class BanditTestAdapter implements TestAdapter {
  private disposables: DisposableI[] = [];
  private readonly testsEmitter =
      new vscode.EventEmitter<TestLoadStartedEvent|TestLoadFinishedEvent>();
  private readonly testStatesEmitter =
      new vscode.EventEmitter<TestRunStartedEvent|TestRunFinishedEvent|
                              TestSuiteEvent|TestEvent>();
  private readonly reloadEmitter = new vscode.EventEmitter<void>();
  private readonly autorunEmitter = new vscode.EventEmitter<void>();
  private config =
      new Configuration('banditTestExplorer', this.workspaceFolder);
  private testSuites: BanditTestSuite[] = [];

  /**
   * Erstellt den Testadapter
   * @param workspaceFolder Arbeitsplatz-Ordner
   */
  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    Logger.instance.info('Initialisiere den Bandit Test-Adapter');
    this.reloadConfiguration();
    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.reloadEmitter);
    this.disposables.push(this.autorunEmitter);
    this.createConfigWatch();
    this.registerCommands();
  }

  // Schnittstellenimplementierungen
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

  /**
   * Startet den Ladevorgang der Testprojekte
   * Laufende Tests werden abgebrochen
   */
  private loadingActive = false;
  public load(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.loadingActive) {
        this.loadingActive = true;
        Logger.instance.info('Lade Bandit Tests');
        this.reset();
        this.notifyLoadStart();
        let progress = new LoadingProgress(0, this.testSuites.length);
        this.notifyLoadProgress(progress);
        Promise
            .all(this.testSuites.map((t) => t.reload().then((result) => {
              progress.steps += 1;
              progress.tests += result.testsuite.tests.length;
              progress.errors +=
                  result.messages.filter((m: Message) => m.isError()).length;
              progress.warnings +=
                  result.messages.filter((m: Message) => m.isWarning()).length;
              this.notifyLoadProgress(progress);
              return result.testsuite;
            })))
            .then(testinfo => {
              this.notifyLoadSuccessful(testinfo);
              this.loadingActive = false;
              resolve();
            })
            .catch(e => {
              let error: string|undefined;
              if (e instanceof Error) {
                Logger.instance.error(e.message);
                error = e.message;
              } else {
                Logger.instance.error(
                    'Unbekannter Fehler beim Laden der Tests');
              }
              this.notifyLoadFailed(error);
              this.loadingActive = false;
              resolve();
            });
      } else {
        resolve();
      }
    });
  }

  /**
   * Startet einen Testlauf für ausgewählte Tests
   * @param tests Test-Ids oder reguläre Ausdrücke zum Ermitteln der Tests
   */
  public run(tests: (string|RegExp)[]): Promise<void> {
    return new Promise((resolve, reject) => {
      Logger.instance.info(`Starte Bandit Tests ${JSON.stringify(tests)}`);
      Promise.all(this.testSuites.map((t) => t.start(tests)))
          .then((nodes) => {
            this.notifyTestrunStart(flatten(nodes));
            resolve();
          })
          .catch(e => {
            if (e instanceof Error) {
              Logger.instance.error(e.message);
            } else {
              Logger.instance.error(
                  'Unbekannter Fehler beim Starten der Tests');
            }
            this.notifyTestrunFinish();
            reject(e);
          });
    });
  }

  /**
   * Startet das Debugging (aktuell noch nicht implementiert)
   * @param tests Test-Ids oder reguläre Ausdrücke zum Ermitteln der Tests
   */
  public debug(tests: (string|RegExp)[]): Promise<void> {
    Logger.instance.warn('Das Debugging ist noch nicht implementiert!');
    return Promise.resolve();
  }

  /**
   * Bricht alle laufenden Tests ab.
   * Wenn in der Konfiguration die Eigenschaft 'allowKillProcess' gesetzt ist,
   * werden die laufenden Prozesse hart beendet.
   */
  public cancel() {
    Promise.all(this.testSuites.map((t) => t.cancel())).catch(e => {
      if (e instanceof Error) {
        Logger.instance.error(e.message);
      } else {
        Logger.instance.error('Unbekannter Fehler beim Abbrechen der Tests');
      }
      this.notifyTestrunFinish();
    });
  }

  /**
   * Verwirft alle Member-Objekte
   */
  public dispose() {
    this.cancel();
    this.disposeArray(this.disposables);
    this.disposables = [];
    this.disposeArray(this.testSuites);
    this.testSuites = [];
  }

  /**
   * Verwirft ein Array vom Typ `DisposableI`
   */
  private disposeArray(disposables: DisposableI[]) {
    disposables.forEach(d => d.dispose());
  }

  /**
   * Setzt alle laufenden Vorgänge zurück, erzeugt die Testsuite neu und ruft
   * intern `cancel()` auf.
   */
  private reset() {
    this.cancel();
    this.resetConfiguration();
    this.disposeArray(this.testSuites);
    this.testSuites = [];
    let onStatusChange = (node: TestNodeI) => {
      this.notifyStatusChanged(node);
    };
    let onMessage = (message: Message) => {
      this.notify(message);
    };
    let onSuiteChange = () => {
      this.load();
    };
    for (let tsconfig of this.config.testsuites) {
      let suite = new BanditTestSuite(
          tsconfig, onSuiteChange, onStatusChange, onMessage);
      this.testSuites.push(suite);
    }
  }

  private resetConfiguration() {
    this.config.reload();
    this.reloadConfiguration();
  }

  private reloadConfiguration() {
    Logger.instance.level = this.config.loglevel;
  }

  /**
   * Erzeugt einen Konfigurations-Watch
   */
  private createConfigWatch() {
    let watch = vscode.workspace.onDidChangeConfiguration(configChange => {
      let affects = (property: Property): boolean => {
        return configChange.affectsConfiguration(
            this.config.fullname(property), this.workspaceFolder.uri);
      };
      if (this.config.propertiesHardReset.some(affects)) {
        // Komplettes Neuladen wenn folgende Konfigurationen geändert wurden:
        this.load();
      } else {
        this.reloadConfiguration();
      }
    });
    this.disposables.push(watch);
  }

  /**
   * Registriert alle Commands
   * Aktuell:
   * - bandit-test-explorer.run  (Zum gefilterten Start von Tests)
   */
  private registerCommands() {
    this.disposables.push(
        vscode.commands.registerCommand('bandit-test-explorer.run', () => {
          vscode.window
              .showInputBox({
                placeHolder:
                    'Geben Sie hier einen Filter zum Ausführen von Tests oder der Testgruppen ein.'
              })
              .then(t => {
                if (t) {
                  this.run([new RegExp(`.*${escapeRegExp(t)}.*`, 'i')]);
                }
              });
        }));
  }

  private notifyLoadStart() {
    this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});
    showLoadingProgress(() => {
      this.cancel();
    });
  }

  private notifyLoadProgress(progress: LoadingProgress) {
    updateLoadingProgress(progress);
  }

  private notifyLoadSuccessful(nodes: TestNodeI[]) {
    let info: TestSuiteInfo = {
      id: 'root',
      label: 'root',
      type: 'suite',
      children: nodes.map(n => n.getTestInfo())
    };
    this.testsEmitter.fire(
        <TestLoadFinishedEvent>{type: 'finished', suite: info});
    closeLoadingProgress();
  }

  private notifyLoadFailed(error?: string) {
    this.testsEmitter.fire(
        <TestLoadFinishedEvent>{type: 'finished', errorMessage: error});
    closeLoadingProgress();
    this.notify(new Message(
        'Laden der Testprojekte', `fehlgeschlagen ${error || ''}`, 'error'));
  }

  private lastTestrunStatus = TestStatusIdle;

  private runningProgress: RunningProgress|undefined;

  private notifyTestrunStart(nodes: TestNodeI[]) {
    if (this.lastTestrunStatus == TestStatusIdle) {
      if (this.testSuites.some(
              (testsuite) => testsuite.status == TestStatusRunning)) {
        this.lastTestrunStatus = TestStatusRunning;
      }
    }
    this.testStatesEmitter.fire(
        <TestRunStartedEvent>{type: 'started', tests: nodes.map(n => n.id)});
    if (!this.runningProgress) {
      showRunningProgress(() => {
        this.cancel();
      });
      this.runningProgress = new RunningProgress(0, nodes.length);
    } else {
      this.runningProgress.stepsMax += nodes.length;
    }
    this.notifyTestrunProgress(this.runningProgress);
  }

  private notifyTestrunProgress(progress: RunningProgress) {
    updateRunningProgress(progress);
  }

  private notifyTestrunFinish() {
    if (this.lastTestrunStatus != TestStatusIdle &&
        this.testSuites.every(
            (testsuite) => testsuite.status != TestStatusRunning)) {
      this.lastTestrunStatus = TestStatusIdle;
      this.runningProgress = undefined;
      this.testStatesEmitter.fire(<TestRunFinishedEvent>{type: 'finished'});
      closeRunningProgress();
    }
  }

  private notify(message: Message) {
    if (message.isError()) {
      vscode.window.showErrorMessage(message.format());
    } else if (message.isWarning()) {
      // vscode.window.showWarningMessage(message.format());
    } else {
      vscode.window.showInformationMessage(message.format());
    }
  }

  private notifyStatusChanged(node: TestNodeI) {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      this.testStatesEmitter.fire(this.getTestStatusEvent(test));
    } else if (group) {
      this.testStatesEmitter.fire(this.getGroupStatusEvent(group));
    }
    if (this.runningProgress) {
      if (node.status == TestStatusFailed) {
        this.runningProgress.failed += 1;
      } else if (node.status == TestStatusPassed) {
        this.runningProgress.passed += 1;
      } else if (node.status == TestStatusSkipped) {
        this.runningProgress.skipped += 1;
      } else if (node.status == TestStatusIdle) {
        this.runningProgress.skipped += 1;
      }
      if (node.status != TestStatusRunning && node.status != TestStatusIdle) {
        this.runningProgress.steps += 1;
      }
      this.notifyTestrunProgress(this.runningProgress);
    }
    this.notifyTestrunFinish();
  }

  private getTestStatusEvent(test: Test): TestEvent {
    let status;
    if (test.status == TestStatusRunning) {
      status = 'running';
    } else if (test.status == TestStatusPassed) {
      status = 'passed';
    } else if (test.status == TestStatusFailed) {
      status = 'failed';
    } else {
      status = 'skipped';
    }
    return {
      type: 'test',
      test: test.id,
      state: status,
      message: test.message
    } as TestEvent;
  }

  private getGroupStatusEvent(group: TestGroup): TestSuiteEvent {
    let status;
    if (group.status == TestStatusRunning) {
      status = 'running';
    } else {
      status = 'completed';
    }
    return {
      type: 'suite',
      suite: group.id,
      state: status,
      message: group.message
    } as TestSuiteEvent;
  }
}
