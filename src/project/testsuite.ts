var now = require('performance-now');

import {ParseResult, TestSpawnerI} from '../execution/testspawner';
import {TestSuiteConfiguration} from '../configuration/configuration';
import {DisposableI} from '../util/disposable';
import {escapeRegExp, formatTimeDuration} from '../util/helper';
import {Logger} from '../util/logger';
import {Message} from '../util/message';
import {TestGroup, TestNodeI} from './test';
import {DisposableWatcher} from '../util/watch';
import {TestQueue, SlotSymbolResolver} from '../execution/testqueue';

export type NotifyTestsuiteChangeHandler = () => void;
export type NotifyStatusHandler = (node: TestNodeI) => void;
export type NotifyStartHandler = (nodes: TestNodeI[]) => void;
export type NotifyMessageHandler = (e: Message) => void;

/**
 * Implementierung einer Testsuite
 */
export class TestSuite implements DisposableI {
  private watch: DisposableI|undefined;
  private changeTimeout: NodeJS.Timer|undefined;
  private testsuite = new TestGroup(undefined, this.name);
  private queue = new TestQueue(this.configuration, this.spawner, node => {
    this.onStatusChange(node);
  });

  constructor(
      public readonly configuration: TestSuiteConfiguration,
      private readonly spawner: TestSpawnerI,
      private readonly onSuiteChange: NotifyTestsuiteChangeHandler,
      private readonly onStatusChange: NotifyStatusHandler,
      private readonly onMessage: NotifyMessageHandler) {}

  public dispose() {
    if (this.watch) {
      this.watch.dispose();
      this.watch = undefined;
    }
  }

  /**
   * Startet das Neuladen der Test-Struktur.
   * @returns Gibt ein Promise mit dem Ladeergebnis zurück
   */
  public reload(): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      this.cancel().then(() => {
        Logger.instance.debug('Starte das Laden der Tests');
        let startTime = now();
        this.spawner.dry([new SlotSymbolResolver(0)])
            .then(result => {
              const duration = now() - startTime;
              result.testsuite.label = this.name;
              this.testsuite = result.testsuite;
              Logger.instance.debug(
                  `Laden der Tests erfolgreich beendet. Benötigte Zeit: ${
                      formatTimeDuration(duration)}`);
              this.resetWatch();
              result.messages.forEach(this.onMessage);
              resolve(result);
            })
            .catch(e => {
              Logger.instance.error('Fehler beim Laden der Tests');
              reject(e);
            });
      });
    });
  }

  /**
   * Startet einen Testlauf für ausgewählte Tests
   * @param ids Test-Ids oder reguläre Ausdrücke zum Ermitteln der Tests
   * @returns Gibt ein Promise mit den gestarteten Tests zurück.
   */
  public start(ids: (string|RegExp)[]): Promise<TestNodeI[]> {
    Logger.instance.debug('Starte einen neuen Testlauf');
    return new Promise((resolve) => {
      let nodes = new Array<TestNodeI>();
      let unique_ids = new Set<string|RegExp>(ids);
      for (let id of unique_ids) {
        let r = typeof id === 'string' ? new RegExp(escapeRegExp(id)) : id;
        nodes = nodes.concat(this.testsuite.findAll(r));
      }
      let startedNodes = new Map<string, TestNodeI>();
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

  /**
   * Bricht alle laufenden Tests ab.
   * @returns  Gibt ein Promise zurück, das erfüllt wird sobald alles
   *     abgebrochen ist.
   */
  public cancel(): Promise<void> {
    return new Promise(resolve => {
      Logger.instance.info('Breche alle laufenden Tests ab');
      this.testsuite.cancel().map(this.onStatusChange, this);
      this.queue.stop();
      this.spawner.stop();
      resolve();
    });
  }

  /**
   * Liefert den eingestellten Namen aus der Konfiguration
   */
  private get name() {
    return this.configuration.name;
  }

  /**
   * Liefert den Status der Testsuite
   */
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
      this.watch = undefined;
    }
    let paths: string[] = [];
    paths.push(this.configuration.cmd);
    if (this.configuration.watches) {
      this.configuration.watches.map((p: string) => paths.push(p));
    }
    const onReady = () => {
      Logger.instance.info(
          `Beobachte Änderung an der Testumgebung ${this.name}...`);
    };
    const onChange = (path: string, stats: any) => {
      Logger.instance.info(`Änderung an an: "${path}" im Testprojekt ${
          this.name} erkannt. Führe Autorun aus.`);
      Logger.instance.debug(`Änderung `);
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
