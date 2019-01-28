
import * as cp from 'child_process';

import * as config from './configuration'
import {Logger} from './helper';

export interface SpawnReturnsI extends cp.SpawnSyncReturns<string> {
  cancelled?: boolean
}

export type SpawnArguments = {
  id: string,
  cmd: string, args?: string[], options?: cp.SpawnSyncOptionsWithStringEncoding
};

interface SpawnTokenI {
  cancel(): void;
}

export class Spawner {
  public static readonly instance = new Spawner();

  private spawnedProcesses = new Map<string, SpawnTokenI>();
  private kill_pending: boolean = false;
  private log: Logger|undefined;

  public setLog(logger: Logger) {
    this.log = logger;
  }

  public spawn(
      args: SpawnArguments,
      config: config.BanditTestSuiteConfigurationI): Promise<SpawnReturnsI> {
    if (this.log) {
      this.log.info(`Neue Anfrage zur Prozessausführung ${args.id}`);
    }
    this.kill_pending = false;
    return this.spawnPending(args, config, 0);
  }

  public spawnPending(
      args: SpawnArguments, config: config.BanditTestSuiteConfigurationI,
      timeouts: number): Promise<SpawnReturnsI> {
    if (this.kill_pending) {
      let msg =
          `Die verzögerte Prozessausführung ${args.id} wurde unterbrochen`;
      if (this.log) {
        this.log.warn(msg);
      }
      throw new Error(msg);
    } else if (config.maxTimeouts && timeouts > config.maxTimeouts) {
      let msg = `Timeout beim Aufruf von spawn() ${args.id}`;
      if (this.log) {
        this.log.warn(msg);
      }
      throw new Error(msg);
    } else if (this.count() >= config.parallelProcessLimit) {
      return new Promise((resolve, reject) => {
               if (this.kill_pending) {
                 let msg =
                     `Die verzögerte Prozessausführung ${
                                                         args.id
                                                       } wurde unterbrochen`;
                 if (this.log) {
                   this.log.warn(msg);
                 }
                 reject(new Error(msg));
               } else {
                 let msg =
                     `Maximale Anzahl paralleler Prozesse erreicht. Verzögere ${
                                                                                args.id
                                                                              }.`;
                 if (this.log) {
                   this.log.debug(msg);
                 }
                 setTimeout(resolve, 64);
               }
             })
          .then(() => {
            return this.spawnPending(args, config, ++timeouts);
          });
    } else {
      return this.spawnInner(args);
    }
  }

  private spawnInner(args: SpawnArguments): Promise<SpawnReturnsI> {
    if (this.exists(args.id)) {
      let msg = `Ein Prozess mit id "${args.id}" exisitiert bereits.`;
      if (this.log) {
        this.log.warn(msg);
      }
      throw new Error(msg);
    }
    if (this.log) {
      let msg = `Starte Prozessausführung "${args.id}".`;
      this.log.info(msg);
    }
    return new Promise((resolve, reject) => {
      const ret: SpawnReturnsI = {
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
        if (this.log) {
          let msg =
              `Fehler bei der Prozessausführung "${args.id}": ${err.message}`;
          this.log.error(msg);
        }
        reject(ret);
        this.kill(args.id);
      });
      command.on('close', (code) => {
        ret.status = code;
        ret.error = new Error('code: ' + String(code));
        if (this.log) {
          let msg = `Prozessausführung "${args.id}" mit Code "${code}"beendet`;
          this.log.info(msg);
        }
        resolve(ret);
        this.kill(args.id);
      });
      let token = <SpawnTokenI>{
        cancel: () => {
          try {
            command.stdout.pause();
            command.kill();
          } catch (e) {
          }
          reject(new Error('Der Prozess wurde beendet.'));
        }
      };
      this.spawnedProcesses.set(args.id, token);
    });
  }

  public count(): number {
    return this.spawnedProcesses.size;
  }

  public exists(id: string): boolean {
    return this.spawnedProcesses.get(id) !== undefined;
  }

  public kill(id: string): void {
    if (!config.allowKillProcess) {
      return;
    }
    var process = this.spawnedProcesses.get(id);
    if (process) {
      process.cancel();
    }
    this.spawnedProcesses.delete(id);
  }

  public killAll(): void {
    this.kill_pending = true;
    var processes = this.spawnedProcesses;
    processes.forEach((value: SpawnTokenI, key: string) => {
      this.kill(key);
    });
  }
}