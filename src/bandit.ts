import {SpawnSyncOptionsWithStringEncoding} from 'child_process';

import * as config from './configuration'
// import uuid = require('uuid');
import {Logger} from './helper';
import {SpawnArguments, Spawner, SpawnReturns} from './spawner'
import {BanditTestNode} from './test'
import {TestSpawner} from './testsuite'

export class BanditSpawner implements TestSpawner {
  constructor(
      private readonly config: config.BanditTestSuiteConfiguration,
      private log: Logger) {}

  public run(node: BanditTestNode): Promise<SpawnReturns> {
    return new Promise<SpawnReturns>((resolve, reject) => {
      let spawn_args = this.createSpawnArgumentsTestRun(node);
      Spawner.spawn(spawn_args, this.config)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
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
  }

  public async dry(id: string): Promise<SpawnReturns> {
    return new Promise<SpawnReturns>((resolve, reject) => {
      let spawn_args = this.createSpawnArgumentsDryRun(id);
      Spawner.spawn(spawn_args, this.config)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              this.log.error(
                  `Fehlerhafter Return-Value beim dry() Aufruf der Test-Executable ${
                                                                                     id
                                                                                   }`);
              reject(ret.error);
            } else {
              this.log.debug(`Test-Executable ${id} erfolgreich aufgerufen`);
              resolve(ret);
            }
          })
          .catch((e) => {
            this.log.error(
                `Fehler beim dry() Aufruf der Test-Executable ${id}`);
            reject(e);
          });
    });
  }

  public stop() {
    this.log.info('Beende alle laufenden Prozesse');
    Spawner.killAll();
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

  private createSpawnArgumentsDryRun(id: string): SpawnArguments {
    var execArguments = new Array();
    execArguments.push('--dry-run');
    execArguments.push('--reporter=spec');
    execArguments.push(
        `"--only=7a310047-cbb3-4ccb-92c0-ead7d4bb10c3d33b11a0-48fb-4755-9cc4-6fbd9518c344"`);  // Ein extrem seltener String
    // `"--only=${uuid()}${uuid()}${uuid()}"`);  // Ein extrem seltener String
    if (this.config.options) {
      execArguments.push(...this.config.options);
    }
    let exec_options = this.createSpawnOptions();
    return {
      id: id,
      cmd: this.config.cmd,
      args: execArguments,
      options: exec_options
    };
  }

  private createSpawnArgumentsTestRun(node: BanditTestNode): SpawnArguments {
    var execArguments = new Array();
    execArguments.push('--reporter=spec');
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
  }
}