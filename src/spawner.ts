
import * as cp from 'child_process';

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
  private log: Logger|undefined;

  public setLog(logger: Logger) {
    this.log = logger;
  }

  public spawn(args: SpawnArguments): Promise<SpawnReturnsI> {
    if (this.log) {
      this.log.info(`Neue Anfrage zur Prozessausführung ${args.id}`);
    }

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
      if (command.stdout != null) {
        command.stdout.on('data', (data) => {
          ret.stdout += data;
          ret.output[0] = ret.stdout;
        });
      }
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
      command.on('close', (code, signal) => {
        ret.status = code;
        let msg =
            `Prozessausführung "${
                                  args.id
                                }" mit Code "${code}" und Signal "${
                                                                    signal
                                                                  }" beendet`;
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
        }
      };
      this.spawnedProcesses.set(args.id, token);
    });
  }

  private exists(id: string): boolean {
    return this.spawnedProcesses.get(id) !== undefined;
  }

  public remove(id: string): void {
    this.spawnedProcesses.delete(id);
  }

  public kill(id: string): void {
    var process = this.spawnedProcesses.get(id);
    if (process) {
      process.cancel();
    }
    this.remove(id);
  }

  public killAll(): void {
    var processes = this.spawnedProcesses;
    processes.forEach((value: SpawnTokenI, key: string) => {
      this.kill(key);
    });
  }
}