
import * as cp from 'child_process';

import * as config from './configuration'
import {Logger} from './helper';

export interface SpawnReturns extends cp.SpawnSyncReturns<string> {
  cancelled?: boolean
}

export type SpawnArguments = {
  id: string,
  cmd: string, args?: string[], options?: cp.SpawnSyncOptionsWithStringEncoding
};

interface SpawnToken {
  cancel(): void;
}

export namespace Spawner {
  let spawnedProcesses = new Map<string, SpawnToken>();
  let kill_pending: boolean = false;
  let log: Logger|undefined;

  export function setLog(logger: Logger) {
    log = logger;
  }
  export async function
  spawn(args: SpawnArguments, config: config.BanditTestSuiteConfiguration):
      Promise<SpawnReturns> {
    if (log) {
      log.info(`Neue Anfrage zur Prozessausführung ${args.id}`);
    }
    kill_pending = false;
    return await spawnPending(args, config, 0);
  }

  async function spawnPending(
      args: SpawnArguments, config: config.BanditTestSuiteConfiguration,
      timeouts: number): Promise<SpawnReturns> {
    if (kill_pending) {
      let msg =
          `Die verzögerte Prozessausführung ${args.id} wurde unterbrochen`;
      if (log) {
        log.warn(msg);
      }
      throw new Error(msg);
    } else if (config.maxTimeouts && timeouts > config.maxTimeouts) {
      let msg = `Timeout beim Aufruf von spawn() ${args.id}`;
      if (log) {
        log.warn(msg);
      }
      throw new Error(msg);
    } else if (count() >= config.parallelProcessLimit) {
      return new Promise((resolve, reject) => {
               if (kill_pending) {
                 let msg =
                     `Die verzögerte Prozessausführung ${
                                                         args.id
                                                       } wurde unterbrochen`;
                 if (log) {
                   log.warn(msg);
                 }
                 reject(new Error(msg));
               } else {
                 let msg =
                     `Maximale Anzahl paralleler Prozesse erreicht. Verzögere ${
                                                                                args.id
                                                                              }.`;
                 if (log) {
                   log.debug(msg);
                 }
                 setTimeout(resolve, 64);
               }
             })
          .then(() => {
            return spawnPending(args, config, ++timeouts);
          });
    } else {
      return spawnInner(args);
    }
  }

  function spawnInner(args: SpawnArguments): Promise<SpawnReturns> {
    if (exists(args.id)) {
      let msg = `Ein Prozess mit id "${args.id}" exisitiert bereits.`;
      if (log) {
        log.warn(msg);
      }
      throw new Error(msg);
    }
    if (log) {
      let msg = `Starte Prozessausführung "${args.id}".`;
      log.info(msg);
    }
    return new Promise((resolve, reject) => {
      const ret: SpawnReturns = {
        pid: 0,
        output: ['', ''],
        stdout: '',
        stderr: '',
        status: 0,
        signal: '',
        error: new Error()
      };
      const command = cp.spawn(args.cmd, args.args, args.options);
      ret.pid = command.pid;
      command.stdout.on('data', (data) => {
        ret.stdout += data;
        ret.output[0] = ret.stdout;
      });
      command.on('error', (err: Error) => {
        ret.error = err;
        if (log) {
          let msg =
              `Fehler bei der Prozessausführung "${args.id}": ${err.message}`;
          log.error(msg);
        }
        reject(ret);
        kill(args.id);
      });
      command.on('close', (code) => {
        ret.status = code;
        ret.error = new Error('code: ' + String(code));
        if (log) {
          let msg = `Prozessausführung "${args.id}" mit Code "${code}"beendet`;
          log.info(msg);
        }
        resolve(ret);
        kill(args.id);
      });
      let token = <SpawnToken>{
        cancel: () => {
          try {
            command.stdout.pause();
            command.kill();
          } catch (e) {
          }
          reject(new Error('Der Prozess wurde beendet.'));
        }
      };
      spawnedProcesses.set(args.id, token);
    });
  }

  export function count(): number {
    return spawnedProcesses.size;
  }

  export function exists(id: string): boolean {
    return spawnedProcesses.get(id) !== undefined;
  }

  export function kill(id: string): void {
    if (!config.allowKillProcess) {
      return;
    }
    var process = spawnedProcesses.get(id);
    if (process) {
      process.cancel();
    }
    spawnedProcesses.delete(id);
  }

  export function killAll(): void {
    kill_pending = true;
    var processes = spawnedProcesses;
    processes.forEach((value: SpawnToken, key: string) => {
      kill(key);
    });
  }
}