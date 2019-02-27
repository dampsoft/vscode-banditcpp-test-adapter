import {TestSuiteConfiguration} from '../configuration/configuration';
import {SymbolResolverI} from '../configuration/symbol';
import {TestGroup, TestNodeI} from '../project/test';
import {TestStatusFailed, TestStatusSkipped} from '../project/teststatus';
import {Logger} from '../util/logger';
import {Message} from '../util/message';
import {Version} from '../util/version';

import {SpawnArguments, Spawner, SpawnResult} from './spawner';

export class ParseResult {
  constructor(public testsuite: TestGroup, public messages: Message[] = []) {}
}

/**
 * Interface für Test-Spawner.
 */
export interface TestSpawnerI {
  readonly version: Version;
  dry(runtimeResolvers?: SymbolResolverI[]): Promise<ParseResult>;
  run(node: TestNodeI,
      runtimeResolvers?: SymbolResolverI[]): Promise<TestNodeI[]>;
  stop(): void;
}

/**
 * Basisklasse für Test-Spawner.
 */
export abstract class TestSpawnerBase implements TestSpawnerI {
  private detectedVersion: Version|undefined;
  constructor(
      protected readonly config: TestSuiteConfiguration,
      private readonly versionRegex: RegExp,
      private readonly fallbackVersion: Version) {
    this.initVersion();
  }

  protected abstract createSpawnArgumentsVersion(): SpawnArguments;
  protected abstract createSpawnArgumentsDryRun(
      runtimeResolvers?: SymbolResolverI[]): SpawnArguments;
  protected abstract createSpawnArgumentsTestRun(
      node: TestNodeI, runtimeResolvers?: SymbolResolverI[]): SpawnArguments;
  protected abstract parseSpawnResult(spawnResult: SpawnResult): ParseResult;

  /**
   * Die verwendete Version des Test-Frameworks
   */
  public get version(): Version {
    return this.detectedVersion || this.fallbackVersion;
  }

  /**
   * Ermittelt die Version anhand eines Aufrufs der Test-Executable.
   * Wenn keine Version ermittelt werden konnte, wird die aktuellste angenommen. @see fallbackVersion
   */
  public initVersion() {
    if (!this.detectedVersion) {
      Logger.instance.debug(
          'Ermittle die aktuelle Version des Test-Frameworks...');
      let spawnArgs = this.createSpawnArgumentsVersion();
      Spawner.instance.spawn(spawnArgs)
          .then((ret: SpawnResult) => {
            let matches = ret.stdout.match(this.versionRegex);
            if (matches && matches.length == 2) {
              return Version.fromString(matches[1]);
            } else {
              return Version.fromString(ret.stdout);
            }
          })
          .then(v => {
            this.detectedVersion = v ? v : this.fallbackVersion;
            if (v) {
              Logger.instance.debug(`Die Version des Test-Frameworks für ${
                  this.config.name} wurde erfolgreich erkannt: ${v}`);
            } else {
              Logger.instance.warn(`Die Version des Test-Frameworks für ${
                  this.config
                      .name} konnte nicht erkannt werden. Verwende aktuellste: ${
                  v}`);
            }
          })
          .catch(error => {
            this.logError(
                'Fehler beim Ermitteln der Version des Test-Frameworks', error);
          });
    }
  }

  /**
   * Startet einen Probelauf ohne tatsächliche Testausführung. Auf Basis der
   * Ausgabe werden alle vorhandenen Tests und deren hierarchischer Zusammenhang
   * ermittelt.
   * @param runtimeResolvers  Optionales Array zusätzlicher Symbol-Resolver
   * @returns  Gibt ein Promise mit dem Ergebnis der Stdout-Analyse zurück.
   */
  public dry(runtimeResolvers?: SymbolResolverI[]): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      let spawnArgs = this.createSpawnArgumentsDryRun(runtimeResolvers);
      Spawner.instance.spawn(spawnArgs)
          .then((ret: SpawnResult) => {
            if (ret.status < 0) {
              Logger.instance.error(
                  `Fehlerhafter Return-Value beim dry() Aufruf der Test-Executable ${
                      this.config.name}`);
              reject(ret.error);
            } else {
              Logger.instance.debug(
                  `Test-Executable ${this.config.name} erfolgreich aufgerufen`);
              resolve(this.parseSpawnResult(ret));
            }
          })
          .catch((error: SpawnResult) => {
            let msg = `Fehler beim dry() Aufruf der Test-Executable ${
                this.config.name}`;
            this.logError(msg, error);
            reject(error.error || new Error(msg));
          });
    });
  }

  /**
   * Führt den Test für einen Testknoten aus.
   * @param  node      Knoten für den der Test ausgeführt werden soll
   * @param runtimeResolvers  Optionales Array zusätzlicher Symbol-Resolver
   * @returns          Gibt ein Promise mit allen betroffenen Testknoten nach
   *                   der Ausführung zurück.
   */
  public run(node: TestNodeI, runtimeResolvers?: SymbolResolverI[]):
      Promise<TestNodeI[]> {
    return new Promise(resolve => {
      let spawnArgs = this.createSpawnArgumentsTestRun(node, runtimeResolvers);
      Spawner.instance.spawn(spawnArgs)
          .then((ret: SpawnResult) => {
            if (!ret.cancelled && ret.status < 0) {
              let msg =
                  `Fehlerhafter Return-Value beim run() Aufruf der Test-Executable ${
                      node.id}`;
              Logger.instance.error(msg);
              resolve(node.finish(TestStatusFailed, msg));
            } else {
              Logger.instance.debug(
                  `Test-Executable ${node.id} erfolgreich aufgerufen`);
              if (ret.cancelled) {
                resolve(node.cancel());
              } else {
                resolve(this.updateNode(node, this.parseSpawnResult(ret)));
              }
            }
          })
          .catch((error: SpawnResult) => {
            this.logError(
                `Fehler beim run() Aufruf der Test-Executable ${node.id}`,
                error);
            resolve(node.finish(TestStatusFailed));
          });
    });
  }

  /**
   * Stoppt alle laufenden und alle wartenden Tests. Wenn zudem
   * `allowKillProcess` aktiviert ist, werden laufende Prozesse hart beendet.
   */
  public stop() {
    Logger.instance.info('Beende alle laufenden Prozesse');
    if (this.config.allowKillProcess) {
      Spawner.instance.killAll();
    }
  }


  /**
   * Aktualisiert einen Testknoten auf Basis des Ausgabestrings.
   * Dazu wird der String zunächst als vollständige Testhierarchie geparsed,
   * dort der gesuchte Knoten ermittelt und dessen Status verwendet.
   * @param  node  Knoten, der aktualisiert werden soll
   * @param  ret   Ausgabe des Testlaufs
   * @returns      Gibt alle aktualisierten Testknoten zurück.
   */
  protected updateNode(node: TestNodeI, ret: ParseResult): TestNodeI[] {
    let nodes = new Array<TestNodeI>();
    let resultNode = ret.testsuite.find(node.id);
    if (resultNode) {
      Logger.instance.debug(
          `Status "${resultNode.status}" für Test "${node.id}" erkannt`);
      nodes = node.finish(resultNode.status, resultNode.message);
    } else {
      Logger.instance.warn(`In der Testausgabe konnte der Test "${
          node.id}" nicht gefunden werden`);
      nodes = node.finish(TestStatusSkipped);
    }
    return nodes;
  }

  /**
   * Loggt ein Fehlerobjekt
   * @param message Nachricht, die dem Fehler vorangestellt werden soll
   * @param error   Fehlerobjekt
   */
  protected logError(message: string, error: any) {
    let msg = message;
    if (typeof error === 'string') {
      if (error.length > 0) msg += `\n${error}`;
    } else if (error instanceof Error) {
      msg += `\n${error.name} - "${error.message}"`;
      if (error.stack) msg += `Stacktrace:\n${error.stack}`;
    } else if (error instanceof SpawnResult) {
      if (error.stderr.length) msg += `\n${error.stderr}`;
    }
    Logger.instance.error(msg);
  }
}