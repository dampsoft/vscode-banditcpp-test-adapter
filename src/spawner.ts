
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

  private active_tokens: number[] = [];

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
    let token = this.pullToken();
    return this.spawnPending(token, args, config, 0);
  }

  public spawnPending(
      token: number, args: SpawnArguments,
      config: config.BanditTestSuiteConfigurationI,
      timeouts: number): Promise<SpawnReturnsI> {
    const cancelResult: SpawnReturnsI = {
      pid: 0,
      output: ['', ''],
      stdout: '',
      stderr: '',
      status: 0,
      signal: '',
      error: new Error(),
      cancelled: true
    };
    if (this.kill_pending) {
      let msg =
          `Die verzögerte Prozessausführung ${args.id} wurde unterbrochen`;
      if (this.log) {
        this.log.warn(msg);
      }
      return new Promise<SpawnReturnsI>((resolve) => {
        resolve(cancelResult);
      });
    } else if (config.maxTimeouts && timeouts > config.maxTimeouts) {
      let msg = `Timeout beim Aufruf von spawn() ${args.id}`;
      if (this.log) {
        this.log.warn(msg);
      }
      throw new Error(msg);
    } else {
      if (this.activateToken(token, config.parallelProcessLimit)) {
        return this.spawnInner(args);
      } else {
        return new Promise((resolve) => {
                 if (this.kill_pending) {
                   let msg =
                       `Die verzögerte Prozessausführung ${
                                                           args.id
                                                         } wurde unterbrochen`;
                   if (this.log) {
                     this.log.warn(msg);
                   }
                   resolve(cancelResult);
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
              return this.spawnPending(token, args, config, ++timeouts);
            });
      }
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
        this.remove(args.id);
      });
      command.on('close', (code) => {
        ret.status = code;
        let msg = `Prozessausführung "${args.id}" mit Code "${code}" beendet`;
        ret.error = new Error(msg);
        if (this.log) {
          this.log.info(msg);
        }
        resolve(ret);
        this.remove(args.id);
      });
      let token = <SpawnTokenI>{
        cancel: () => {
          try {
            command.stdout.pause();
            command.kill();
          } catch (e) {
          }
          ret.cancelled = true;
          resolve(ret);
          // reject(new Error('Der Prozess wurde beendet.'));
        }
      };
      this.spawnedProcesses.set(args.id, token);
    });
  }

  private get current_token(): number {
    return Math.max(0, ...this.active_tokens);
  }

  private pullToken(): number {
    if (this.count() == 0) {
      this.active_tokens = [];
    }
    let pulled_token = this.current_token + 1;
    this.active_tokens.push(pulled_token);
    return pulled_token;
  }

  private activateToken(token: number, token_limit: number): boolean {
    let token_buffer = token_limit - this.count();
    let activated =
        token_buffer > 0 && token <= this.current_token + token_buffer;
    if (activated) {
      this.active_tokens.push(token);
    }
    return activated;
  }

  private count(): number {
    return this.spawnedProcesses.size;
  }

  private exists(id: string): boolean {
    return this.spawnedProcesses.get(id) !== undefined;
  }

  public remove(id: string): void {
    this.spawnedProcesses.delete(id);
  }

  public kill(id: string): void {
    if (config.allowKillProcess) {
      var process = this.spawnedProcesses.get(id);
      if (process) {
        process.cancel();
      }
    }
    this.remove(id);
  }

  public killAll(): void {
    this.kill_pending = true;
    var processes = this.spawnedProcesses;
    processes.forEach((value: SpawnTokenI, key: string) => {
      this.kill(key);
    });
  }
}