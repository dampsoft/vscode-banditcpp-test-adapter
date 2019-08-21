var now = require('performance-now');

import { ParseResult, TestSpawnerI } from '../execution/testspawner';
import { TestSuiteConfiguration } from '../configuration/configuration';
import { DisposableI } from '../util/disposable';
import { CanNotifyMessages, NotifyMessageHandler } from '../util/message';
import { TestGroup, TestNodeI } from './test';
import { DisposableWatcher } from '../util/watch';
import { TestQueue, SlotSymbolResolver } from '../execution/testqueue';
import { Messages } from './messages';

export type NotifyTestsuiteChangeHandler = () => void;
export type NotifyStatusHandler = (node: TestNodeI) => void;
export type NotifyStartHandler = (nodes: TestNodeI[]) => void;

/**
 * Implementierung einer Testsuite
 */
export class TestSuite extends CanNotifyMessages implements DisposableI {
  private watch: DisposableI | undefined;
  private changeTimeout: NodeJS.Timer | undefined;
  private testsuite = new TestGroup(undefined, this.name);
  private queue = new TestQueue(this.configuration, node => {
    this.onStatusChange(node);
  });

  constructor(
    public readonly configuration: TestSuiteConfiguration,
    private readonly spawner: TestSpawnerI,
    private readonly onSuiteChange: NotifyTestsuiteChangeHandler,
    private readonly onStatusChange: NotifyStatusHandler,
    notificationHandler: NotifyMessageHandler) {
    super(notificationHandler);
  }

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
        Messages.getTestsuiteReloadStart(this.name).log();
        let startTime = now();
        this.spawner.dry([new SlotSymbolResolver(0)])
          .then(result => {
            const duration = now() - startTime;
            result.testsuite.label = this.name;
            this.testsuite = result.testsuite;  // TODO?: partial update?
            Messages.getTestsuiteReloadFinishedValid(this.name, duration)
              .log();
            this.resetWatch();
            result.messages.forEach(m => this.notify(m, false));
            resolve(result);
          })
          .catch(e => {
            const duration = now() - startTime;
            Messages.getTestsuiteReloadFinishedInvalid(this.name, duration)
              .log();
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
  public start(ids: (string | RegExp)[]): Promise<TestNodeI[]> {
    return new Promise((resolve) => {
      let startingNodes = new Map<string, TestNodeI>();
      let uniqueIds = new Set<string | RegExp>(ids);
      Array.from(uniqueIds).forEach(id => {
        this.testsuite.findAll(id).forEach(n => {
          n.start().forEach(c => {
            startingNodes.set(c.id, c);
          });
        });
      });
      Messages.getTestsuiteRunStart(this.name, startingNodes.size).log();
      let nodes = Array.from(startingNodes.values());
      this.queue.push(nodes, this.spawner);
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
      Messages.getTestsuiteRunCancel(this.name).log();
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
      Messages.getTestsuiteWatchReady(this.name).log();
    };
    const onChange = (path: string, stats: any) => {
      Messages.getTestsuiteWatchTrigger(this.name, path).log();
      if (this.changeTimeout) {
        clearTimeout(this.changeTimeout);
        this.changeTimeout = undefined;
      }
      this.changeTimeout = setTimeout(() => {
        this.onSuiteChange();
      }, this.configuration.watchTimeoutSec * 1000);
    };
    const onError = () => {
      Messages.getTestsuiteWatchError(this.name).log();
    };
    this.watch = new DisposableWatcher(paths, onReady, onChange, onError);
  }
}
