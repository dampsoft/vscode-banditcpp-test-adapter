var now = require('performance-now');
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

import {BanditSpawner} from './bandit';
import {BanditTestSuiteConfiguration} from './configuration';
import {DisposableI} from './disposable';
import {escapeRegExp, formatTimeDuration, removeDuplicates} from './helper';
import {Logger} from './logger';
import {Message} from './message';
import {asTest, asTestGroup, BanditTest, BanditTestGroup, BanditTestNode} from './test';
import * as teststatus from './teststatus';
import {DisposableWatcher} from './watch';
import {Testqueue} from './testqueue';

export type NotifyTestsuiteChangeHandler = () => void;
export type NotifyStatusHandler = (e: TestSuiteEvent|TestEvent) => void;
export type NotifyStartHandler = (e: TestRunStartedEvent) => void;
export type NotifyFinishHandler = (e: TestRunFinishedEvent) => void;
export type NotifyMessageHandler = (e: Message) => void;

/**
 * Interface für Testsuites
 */
export interface TestSuiteI extends DisposableI {
  reload(): Promise<TestSuiteInfo|TestInfo>;
  start(ids: (string|RegExp)[]): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * Implementierung der Testsuite für Bandit
 */
export class BanditTestSuite implements TestSuiteI {
  private watch: DisposableI|undefined;
  private changeTimeout: NodeJS.Timer|undefined;
  private testsuite = new BanditTestGroup(undefined, this.name);
  private spawner = new BanditSpawner(this.configuration);
  private queue = new Testqueue(this.configuration, this.spawner, node => {
    this.notifyStatus(node);
  });

  constructor(
      public readonly configuration: BanditTestSuiteConfiguration,   //
      private readonly onSuiteChange: NotifyTestsuiteChangeHandler,  //
      private readonly onStatusChange: NotifyStatusHandler,          //
      private readonly onStart: NotifyStartHandler,                  //
      private readonly onFinish: NotifyFinishHandler,                //
      private readonly onMessage: NotifyMessageHandler) {}

  public dispose() {
    if (this.watch) {
      this.watch.dispose();
      this.watch = undefined;
    }
  }

  public reload(): Promise<TestSuiteInfo|TestInfo> {
    return new Promise((resolve, reject) => {
      this.cancel().then(() => {
        Logger.instance.debug('Starte das Laden der Tests');
        let startTime = now();
        this.spawner.dry()
            .then(result => {
              const duration = now() - startTime;
              result.testsuite.label = this.name;
              this.testsuite = result.testsuite;
              Logger.instance.debug(
                  `Laden der Tests erfolgreich beendet. Benötigte Zeit: ${
                      formatTimeDuration(duration)}`);
              this.resetWatch();
              // Display Errors:
              for (let message of result.messages) {
                this.onMessage(message);
              }
              resolve(this.testsuite.getTestInfo());
            })
            .catch(e => {
              Logger.instance.error('Fehler beim Laden der Tests');
              this.notifyFinished();
              reject(e);
            });
      });
    });
  }

  public start(ids: (string|RegExp)[]): Promise<void> {
    Logger.instance.debug('Starte einen neuen Testlauf');
    return new Promise(() => {
      let nodes = new Array<BanditTestNode>();
      let unique_ids = new Set<string|RegExp>(ids);
      for (let id of unique_ids) {
        let r = typeof id === 'string' ? new RegExp(escapeRegExp(id)) : id;
        nodes = nodes.concat(this.testsuite.findAll(r));
      }
      let startedNodes = new Array<BanditTestNode>();
      for (var node of nodes) {
        startedNodes = startedNodes.concat(node.start());
      }
      startedNodes = removeDuplicates(startedNodes, 'id');
      Logger.instance.debug(`${nodes.length} Tests werden gestartet`);
      this.notifyStart(startedNodes);
      this.queue.push(startedNodes);
    });
  }

  public cancel(): Promise<void> {
    return new Promise(resolve => {
      Logger.instance.info('Breche alle laufenden Tests ab');
      this.testsuite.cancel().map(this.notifyStatus, this);
      this.queue.stop();
      this.spawner.stop();
      resolve();
    });
  }

  private get name() {
    return this.configuration.name;
  }

  private notifyStatus(node: BanditTestNode) {
    let e = this.getStatusEvent(node);
    if (e) {
      this.onStatusChange(e);
      if (this.testsuite.status != teststatus.Running) {
        this.notifyFinished();
      }
    }
  }

  private notifyStart(nodes: BanditTestNode[]) {
    let ids = new Array<string>();
    for (let node of nodes) {
      ids.push(node.id);
      let group = asTestGroup(node);
      if (group) {
        let tests = group.tests;
        for (let test of tests) {
          ids.push(test.id);
        }
      }
    }
    this.onStart(<TestRunStartedEvent>{type: 'started', tests: ids});
  }

  private notifyFinished() {
    this.onFinish(<TestRunFinishedEvent>{type: 'finished'});
  }

  private getStatusEvent(node: BanditTestNode): TestEvent|TestSuiteEvent
      |undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusEvent(test);
    } else if (group) {
      return this.getGroupStatusEvent(group);
    }
    return undefined;
  }

  private getTestStatusEvent(test: BanditTest): TestEvent {
    let status;
    if (test.status == teststatus.Running) {
      status = 'running';
    } else if (test.status == teststatus.Passed) {
      status = 'passed';
    } else if (test.status == teststatus.Failed) {
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

  private getGroupStatusEvent(group: BanditTestGroup): TestSuiteEvent {
    let status;
    if (group.status == teststatus.Running) {
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

  /**
   * Erzeugt Datei-Watches.
   * Bei Änderungen an den beobachteten Test-Dateien wird `onSuiteChange()`
   * getriggert.
   */
  private resetWatch() {
    if (this.watch) {
      this.watch.dispose();
    }
    let paths: string[] = [];
    paths.push(this.configuration.cmd);
    if (this.configuration.watches) {
      paths.concat(this.configuration.watches);
    }
    const onReady = () => {
      Logger.instance.info(
          `Beobachte Änderung an der Testumgebung ${this.name}...`);
    };
    const onChange = () => {
      Logger.instance.info(`Änderung an der Testumgebung ${
          this.name} erkannt. Führe Autorun aus.`);
      if (this.changeTimeout) {
        clearTimeout(this.changeTimeout);
        this.changeTimeout = undefined;
      }
      this.changeTimeout = setTimeout(() => {
        this.onSuiteChange();
      }, this.configuration.watchTimeoutSec * 1000);
    };
    const onError = () => {
      Logger.instance.error(`Beim Beobachten der Testumgebung ${
          this.name} ist ein Fehler aufgetreten.`);
    };
    this.watch = new DisposableWatcher(paths, onReady, onChange, onError);
  }
}
