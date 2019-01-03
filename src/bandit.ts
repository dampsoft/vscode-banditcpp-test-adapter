import {SpawnSyncOptionsWithStringEncoding} from 'child_process';
import {Log} from 'vscode-test-adapter-util';

import {BanditConfiguration} from './configuration'
import {SpawnArguments, Spawner, SpawnReturns} from './spawner'
import {BanditTestNode} from './test'
import {TestSpawner} from './testsuite'



export class BanditSpawner implements TestSpawner {
  constructor(private readonly config: BanditConfiguration, private log: Log) {}
  private spawner = new Spawner(this.config);

  private createSpawnOptions(): SpawnSyncOptionsWithStringEncoding {
    return <SpawnSyncOptionsWithStringEncoding>{
      cwd: this.config.cwd,
      env: this.config.env,
      shell: true,
      windowsVerbatimArguments: true,
      encoding: 'utf8',
      windowsHide: true
    };
  }

  private createSpawnArgumentsDryRun(): SpawnArguments {
    var execArguments = new Array();
    execArguments.push('--dry-run');
    execArguments.push('--reporter=spec');
    execArguments.push(...this.config.args);
    let exec_options = this.createSpawnOptions();
    return <SpawnArguments>{
      id: 'dry-all',
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
        execArguments.push('"--only=' + label_filter + '"');
      }
    }
    execArguments.push(...this.config.args);
    let exec_options = this.createSpawnOptions();
    return <SpawnArguments>{
      id: node.id,
      cmd: this.config.cmd,
      args: execArguments,
      options: exec_options
    };
  }

  public run(node: BanditTestNode): Promise<SpawnReturns> {
    return new Promise<SpawnReturns>((resolve, reject) => {
      let spawn_args = this.createSpawnArgumentsTestRun(node);
      this.spawner.spawn(spawn_args)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              this.log.error(
                  'Fehlerhafter Return-Value beim run() Aufruf der Testexecutable');
              reject(ret.error);
            } else {
              this.log.debug('Testexecutable erfolgreich aufgerufen');
              resolve(ret);
            }
          })
          .catch((e) => {
            this.log.error('Fehler beim run() Aufruf der Testexecutable');
            reject(e);
          });
    });
  }

  public async dry(): Promise<SpawnReturns> {
    return new Promise<SpawnReturns>((resolve, reject) => {
      let spawn_args = this.createSpawnArgumentsDryRun();
      this.spawner.spawn(spawn_args)
          .then((ret: SpawnReturns) => {
            if (ret.status < 0) {
              this.log.error(
                  'Fehlerhafter Return-Value beim dry() Aufruf der Testexecutable');
              reject(ret.error);
            } else {
              this.log.debug('Testexecutable erfolgreich aufgerufen');
              resolve(ret);
            }
          })
          .catch((e) => {
            this.log.error('Fehler beim dry() Aufruf der Testexecutable');
            reject(e);
          });
    });
  }

  public stop() {
    this.log.info('Beende alle laufenden Prozesse');
    this.spawner.killAll();
  }
}