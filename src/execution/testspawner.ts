import {BanditSpawner} from '../banditcpp/bandit';
import {TestSuiteConfiguration} from '../configuration/configuration';
import {SymbolResolverI} from '../configuration/symbol';
import {TestGroup, TestNodeI} from '../project/test';
import {TestStatusFailed, TestStatusSkipped} from '../project/teststatus';
import {Message} from '../util/message';
import {Version} from '../util/version';

import {Messages} from './messages';
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

export class TestSpawnerFactory {
  public static createSpawner(tsconfig: TestSuiteConfiguration): TestSpawnerI {
    if (tsconfig.framework == 'bandit') {
      return new BanditSpawner(tsconfig);
    }
    throw new Error(Messages
                        .getTestSpawnerFactoryDetectFrameworkError(
                            tsconfig.name, tsconfig.framework)
                        .format());
  }
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
      Message.log(
          Messages.getTestSpawnerDetectFrameworkVersionStart(this.config.name));
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
              Message.log(
                  Messages.getTestSpawnerDetectFrameworkVersionFinishedValid(
                      this.config.name, v.toString()));
            } else {
              Message.log(
                  Messages.getTestSpawnerDetectFrameworkVersionFinishedInvalid(
                      this.config.name, this.detectedVersion.toString()));
            }
          })
          .catch(error => {
            Message.log(Messages.getTestSpawnerDetectFrameworkVersionError(
                this.config.name, error));
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
              Message.log(Messages.getTestSpawnerDryRunFinishedInvalid(
                  this.config.name));
              reject(ret.error);
            } else {
              Message.log(
                  Messages.getTestSpawnerDryRunFinishedValid(this.config.name));
              resolve(this.parseSpawnResult(ret));
            }
          })
          .catch((error: SpawnResult) => {
            let msg = Messages.getTestSpawnerDryRunError(
                this.config.name, error.error);
            Message.log(msg);
            reject(error.error || new Error(msg.format()));
          });
    });
  }

  /**
   * Führt den Test für einen Testknoten aus.
   * @param  node             Knoten für den der Test ausgeführt werden soll
   * @param runtimeResolvers  Optionales Array zusätzlicher Symbol-Resolver
   * @returns                 Gibt ein Promise mit allen betroffenen Testknoten
   *                          nach der Ausführung zurück.
   */
  public run(node: TestNodeI, runtimeResolvers?: SymbolResolverI[]):
      Promise<TestNodeI[]> {
    return new Promise(resolve => {
      let spawnArgs = this.createSpawnArgumentsTestRun(node, runtimeResolvers);
      Spawner.instance.spawn(spawnArgs)
          .then((ret: SpawnResult) => {
            if (!ret.cancelled && ret.status < 0) {
              let msg = Messages.getTestSpawnerTestRunFinishedInvalid(node.id);
              Message.log(msg);
              resolve(node.finish(TestStatusFailed, msg.format()));
            } else {
              Message.log(Messages.getTestSpawnerTestRunFinishedValid(node.id));
              if (ret.cancelled) {
                resolve(node.cancel());
              } else {
                resolve(this.updateNode(node, this.parseSpawnResult(ret)));
              }
            }
          })
          .catch((error: SpawnResult) => {
            let msg =
                Messages.getTestSpawnerTestRunError(this.config.name, error);
            Message.log(msg);
            resolve(node.finish(TestStatusFailed, msg.format()));
          });
    });
  }

  /**
   * Stoppt alle laufenden und alle wartenden Tests. Wenn zudem
   * `allowKillProcess` aktiviert ist, werden laufende Prozesse hart beendet.
   */
  public stop() {
    Message.notify(Messages.getTestSpawnerStopRunningProcesses(
        this.config.name, this.config.allowKillProcess));
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
      Message.log(Messages.getTestSpawnerTestResultUpdateValid(
          node.id, resultNode.status));
      nodes = node.finish(resultNode.status, resultNode.message);
    } else {
      Message.log(Messages.getTestSpawnerTestResultUpdateInvalid(node.id));
      nodes = node.finish(TestStatusSkipped);
    }
    return nodes;
  }
}