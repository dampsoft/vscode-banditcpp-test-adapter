import * as vscode from 'vscode';
import {TestAdapter, TestEvent, TestInfo, TestLoadFinishedEvent, TestLoadStartedEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent, TestSuiteInfo} from 'vscode-test-adapter-api';

import {BanditConfigurationI, Configuration, Property} from './configuration';
import {DisposableI} from './disposable'
import {escapeRegExp, Logger} from './helper';
import {Message} from './message';
import {BanditTestSuite, TestSuiteI} from './testsuite';

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
  private config: BanditConfigurationI =
      new Configuration(this.workspaceFolder);
  private testSuites: TestSuiteI[] = [];

  /**
   * Erstellt den Testadapter
   * @param workspaceFolder Arbeitsplatz-Ordner
   * @param log Logger
   */
  constructor(
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private readonly log: Logger) {
    this.log.info('Initialisiere den Bandit Test-Adapter');
    this.disposables.push(this.testsEmitter);
    this.disposables.push(this.testStatesEmitter);
    this.disposables.push(this.reloadEmitter);
    this.disposables.push(this.autorunEmitter);
    this.createConfigWatch();
    this.registerCommand();
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
  public load(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log.info('Lade Bandit Tests');
      this.reset();
      this.testsEmitter.fire(<TestLoadStartedEvent>{type: 'started'});
      let promises = new Array<Promise<TestSuiteInfo|TestInfo>>();
      for (let testSuite of this.testSuites) {
        promises.push(testSuite.reload());
      }
      Promise.all(promises)
          .then((testinfo) => {
            let info: TestSuiteInfo =
                {id: 'root', label: 'root', type: 'suite', children: testinfo};
            this.testsEmitter.fire(
                <TestLoadFinishedEvent>{type: 'finished', suite: info});
            resolve();
          })
          .catch((e) => {
            this.log.error(e.message);
            this.testsEmitter.fire(<TestLoadFinishedEvent>{type: 'finished'});
            reject(e);
          });
    });
  }

  /**
   * Startet einen Testlauf für ausgewählte Tests
   * @param tests Test-Ids oder reguläre Ausdrücke zum Ermitteln der Tests
   */
  public run(tests: (string|RegExp)[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log.info(`Starte Bandit Tests ${JSON.stringify(tests)}`);
      this.testStatesEmitter.fire(
          <TestRunStartedEvent>{type: 'started', tests});
      let promises = new Array<Promise<void>>();
      for (let testSuite of this.testSuites) {
        promises.push(testSuite.start(tests));
      }
      Promise.all(promises)
          .then(() => {
            resolve();
          })
          .catch((e) => {
            this.log.error(e.message);
            this.testStatesEmitter.fire(
                <TestRunFinishedEvent>{type: 'finished'});
            reject(e);
          });
    })
  }

  /**
   * Startet das Debugging (aktuell noch nicht implementiert)
   * @param tests Test-Ids oder reguläre Ausdrücke zum Ermitteln der Tests
   */
  public debug(tests: (string|RegExp)[]): Promise<void> {
    this.log.warn('Das Debugging ist noch nicht implementiert!');
    return this.run(tests);
  }

  /**
   * Bricht alle laufenden Tests ab.
   * Wenn in der Konfiguration die Eigenschaft 'allowKillProcess' gesetzt ist,
   * werden die laufenden Prozesse hart beeendet.
   */
  public cancel() {
    this.testSuites.forEach(s => s.cancel());
  }

  /**
   * Verwirft alle Memberobjekte
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
    this.config = new Configuration(this.workspaceFolder);
    this.testSuites = [];
    let onStatusChange = (e: TestSuiteEvent|TestEvent) => {
      this.testStatesEmitter.fire(e);
    };
    let onStart = (e: TestRunStartedEvent) => {
      this.testStatesEmitter.fire(e);
    };
    let onFinish = (e: TestRunFinishedEvent) => {
      this.testStatesEmitter.fire(e);
    };
    let onMessage = (message: Message) => {
      if (message.isError()) {
        vscode.window.showErrorMessage(message.format());
      } else {
        vscode.window.showInformationMessage(message.format());
      }
    };
    let onSuiteChange = () => {};
    for (let tsconfig of this.config.testsuites) {
      let suite = new BanditTestSuite(
          tsconfig, onSuiteChange, onStatusChange, onStart, onFinish, onMessage,
          this.log);
      this.testSuites.push(suite);
    }
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
      if (this.config.properties.some(affects)) {
        this.load();
      }
    });
    this.disposables.push(watch);
  }

  private registerCommand() {
    this.disposables.push(
        vscode.commands.registerCommand('bandit-test-explorer.run', () => {
          vscode.window
              .showInputBox({
                placeHolder:
                    'Geben Sie hier einen Filter zum Ausführen von Tests oder der Testgruppen ein.'
              })
              .then((t) => {
                if (t) {
                  this.run([new RegExp(`.*${escapeRegExp(t)}.*`, 'i')]);
                }
              });
        }));
  }
}
