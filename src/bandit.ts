import {SpawnSyncOptionsWithStringEncoding} from 'child_process';

import * as config from './configuration'
import {Logger} from './helper';
import {SpawnArguments, Spawner, SpawnReturnsI} from './spawner'
import {BanditTestNode} from './test'
import {Version} from './version'

export class BanditSpawner {
  private readonly banditVersionFallback = new Version(3, 0, 0);
  private banditVersionDetected: Version|undefined;

  private getBanditVersion(): Promise<Version> {
    return new Promise((resolve) => {
      if (!this.banditVersionDetected) {
        this.createSpawnArgumentsVersion().then((spawn_args) => {
          this.log.debug('Ermittle die aktuelle Version des Testframeworks...');
          Spawner.instance.spawn(spawn_args, this.config)
              .then((ret: SpawnReturnsI) => {
                let matches =
                    ret.stdout.match(/bandit version (\d+\.\d+\.\d+)/i);
                if (matches && matches.length == 2) {
                  return Version.fromString(matches[1]);
                } else {
                  return Version.fromString(ret.stdout);
                }
              })
              .then((v) => {
                let banditVersion = v ? v : this.banditVersionFallback;
                this.banditVersionDetected = banditVersion;
                if (v) {
                  this.log.debug(
                      `Die Version des Testframeworks für ${
                                                            this.config.name
                                                          } wurde erfolgreich erkannt: ${
                                                                                         banditVersion
                                                                                       }`);
                } else {
                  this.log.warn(
                      `Die Version des Testframeworks für ${
                                                            this.config.name
                                                          } konnte nicht erkannt werden. Verwende aktuellste: ${
                                                                                                                banditVersion
                                                                                                              }`);
                }
                resolve(banditVersion);
              });
        });
      } else {
        resolve(this.banditVersionDetected);
      }
    });
  }

  constructor(
      private readonly config: config.BanditTestSuiteConfigurationI,
      private log: Logger) {}

  public run(node: BanditTestNode): Promise<SpawnReturnsI> {
    return new Promise<SpawnReturnsI>((resolve, reject) => {
      this.createSpawnArgumentsTestRun(node).then((spawn_args) => {
        Spawner.instance.spawn(spawn_args, this.config)
            .then((ret: SpawnReturnsI) => {
              if (!ret.cancelled && ret.status < 0) {
                this.log.error(
                    `Fehlerhafter Return-Value beim dry() Aufruf der Test-Executable ${
                                                                                       node.id
                                                                                     }`);
                reject(ret.error);
              } else {
                this.log.debug(
                    `Test-Executable ${node.id} erfolgreich aufgerufen`);
                resolve(ret);
              }
            })
            .catch((e) => {
              this.log.error(
                  `Fehler beim dry() Aufruf der Test-Executable ${node.id}`);
              reject(e);
            });
      });
    });
  }

  public dry(): Promise<SpawnReturnsI> {
    return new Promise<SpawnReturnsI>((resolve, reject) => {
      this.createSpawnArgumentsDryRun().then((spawn_args) => {
        Spawner.instance.spawn(spawn_args, this.config)
            .then((ret: SpawnReturnsI) => {
              if (ret.status < 0) {
                this.log.error(
                    `Fehlerhafter Return-Value beim dry() Aufruf der Test-Executable ${
                                                                                       this.config
                                                                                           .name
                                                                                     }`);
                reject(ret.error);
              } else {
                this.log.debug(`Test-Executable ${
                                                  this.config.name
                                                } erfolgreich aufgerufen`);
                resolve(ret);
              }
            })
            .catch((e) => {
              this.log.error(
                  `Fehler beim dry() Aufruf der Test-Executable ${
                                                                  this.config
                                                                      .name
                                                                }`);
              reject(e);
            });
      });
    });
  }

  public stop() {
    this.log.info('Beende alle laufenden Prozesse');
    Spawner.instance.killAll();
  }

  private createSpawnOptions(): SpawnSyncOptionsWithStringEncoding {
    return {
      cwd: this.config.cwd,
      env: this.config.env,
      shell: true,
      windowsVerbatimArguments: true,
      encoding: 'utf8'
    };
  }

  private createDefaultExecutionArguments(): Promise<string[]> {
    return new Promise((resolve) => {
      this.getBanditVersion().then((version) => {
        let execArguments = new Array<string>();
        execArguments.push('--reporter=spec');
        if (version.greaterOrEqual(new Version(3, 0, 0))) {
          execArguments.push('--colorizer=off');
        } else {
          execArguments.push('--no-color');
        }
        resolve(execArguments);
      });
    });
  }

  private createSpawnArgumentsVersion(): Promise<SpawnArguments> {
    return new Promise((resolve) => {
      resolve(<SpawnArguments>{
        id: this.config.name,
        cmd: this.config.cmd,
        args: ['--version'],
        options: this.createSpawnOptions()
      });
    });
  }

  private createSpawnArgumentsDryRun(): Promise<SpawnArguments> {
    return new Promise((resolve) => {
      this.createDefaultExecutionArguments().then((execArguments) => {
        execArguments.push('--dry-run');
        execArguments.push(
            `"--only=7a310047-cbb3-4ccb-92c0-ead7d4bb10c3d33b11a0-48fb-4755-9cc4-6fbd9518c344"`);  // Ein extrem seltener String
        // `"--only=${uuid()}${uuid()}${uuid()}"`);  // Ein extrem seltener
        // String
        if (this.config.options) {
          execArguments.push(...this.config.options);
        }
        let exec_options = this.createSpawnOptions();
        resolve({
          id: `${this.config.name}-dry-run`,
          cmd: this.config.cmd,
          args: execArguments,
          options: exec_options
        });
      });
    });
  }

  private createSpawnArgumentsTestRun(node: BanditTestNode):
      Promise<SpawnArguments> {
    return this.createDefaultExecutionArguments().then((execArguments) => {
      // Finde den längstmöglichen Teilstring zwischen Unicode-Zeichen und
      // verwende ihn als Testlauf-Filter:
      let label_matches = node.label.match(/[^\u00A1-\uFFFF]+/ig);
      if (label_matches) {
        var label_filter = label_matches.reduce(function(a, b) {
          return a.length > b.length ? a : b;
        });
        if (label_filter.length > 0) {
          execArguments.push(`"--only=${label_filter}"`);
        }
      }
      if (this.config.options) {
        execArguments.push(...this.config.options);
      }
      let exec_options = this.createSpawnOptions();
      return {
        id: node.id,
        cmd: this.config.cmd,
        args: execArguments,
        options: exec_options
      };
    });
  }
}