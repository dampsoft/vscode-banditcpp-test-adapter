var now = require('performance-now');

import {BanditSpawner} from './bandit';
import {BanditTestSuiteConfiguration} from './configuration';
import {DisposableI} from './disposable';
import {escapeRegExp, formatTimeDuration} from './helper';
import {Logger} from './logger';
import {Message} from './message';
import {BanditTestGroup, BanditTestNode} from './test';
import {DisposableWatcher} from './watch';
import {Testqueue} from './testqueue';

export type NotifyTestsuiteChangeHandler = () => void;
export type NotifyStatusHandler = (node: BanditTestNode) => void;
export type NotifyStartHandler = (nodes: BanditTestNode[]) => void;
export type NotifyMessageHandler = (e: Message) => void;

/**
 * Implementierung der Testsuite für Bandit
 */
export class BanditTestSuite {
  private watch: DisposableI|undefined;
  private changeTimeout: NodeJS.Timer|undefined;
  private testsuite = new BanditTestGroup(undefined, this.name);
  private spawner = new BanditSpawner(this.configuration);
  private queue = new Testqueue(this.configuration, this.spawner, node => {
    this.onStatusChange(node);
  });

  constructor(
      public readonly configuration: BanditTestSuiteConfiguration,   //
      private readonly onSuiteChange: NotifyTestsuiteChangeHandler,  //
      private readonly onStatusChange: NotifyStatusHandler,          //
      private readonly onMessage: NotifyMessageHandler) {}

  public dispose() {
    if (this.watch) {
      this.watch.dispose();
      this.watch = undefined;
    }
  }

  public reload(): Promise<BanditTestNode> {
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
              result.messages.forEach(m => this.onMessage(m));
              resolve(this.testsuite);
            })
            .catch(e => {
              Logger.instance.error('Fehler beim Laden der Tests');
              reject(e);
            });
      });
    });
  }

  public start(ids: (string|RegExp)[]): Promise<BanditTestNode[]> {
    Logger.instance.debug('Starte einen neuen Testlauf');
    return new Promise((resolve) => {
      let nodes = new Array<BanditTestNode>();
      let unique_ids = new Set<string|RegExp>(ids);
      for (let id of unique_ids) {
        let r = typeof id === 'string' ? new RegExp(escapeRegExp(id)) : id;
        nodes = nodes.concat(this.testsuite.findAll(r));
      }
      let startedNodes = new Map<string, BanditTestNode>();
      nodes.forEach((n) => {
        n.start().forEach((n) => {
          startedNodes.set(n.id, n);
        });
      });
      Logger.instance.debug(`${startedNodes.size} Tests werden gestartet`);
      nodes = Array.from(startedNodes.values());
      this.queue.push(nodes);
      resolve(nodes);
    });
  }

  public cancel(): Promise<void> {
    return new Promise(resolve => {
      Logger.instance.info('Breche alle laufenden Tests ab');
      this.testsuite.cancel().map(this.onStatusChange, this);
      this.queue.stop();
      this.spawner.stop();
      resolve();
    });
  }

  private get name() {
    return this.configuration.name;
  }

  public get status() {
    return this.testsuite.status;
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
