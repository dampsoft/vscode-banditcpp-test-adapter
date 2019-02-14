import * as cp from 'child_process';
const {spawn} = require('child_process');

import {Logger} from './logger';

export class SpawnResult {
  constructor(
      public pid: number = 0, public stdout: string = '',
      public stderr: string = '', public status: number = 0,
      public signal: string = '', public cancelled: boolean = false) {}
  public error?: Error;

  public isFailed(): boolean {
    return this.error != undefined || this.signal != null || this.status < 0;
  }
}

export type SpawnArguments = {
  id: string; cmd: string;
  args?: string[];
  options?: cp.SpawnSyncOptions;
};

interface SpawnTokenI {
  cancel(): void;
}

export class Spawner {
  public static readonly instance = new Spawner();

  private spawnedProcesses = new Map<string, SpawnTokenI>();

  public spawn(args: SpawnArguments): Promise<SpawnResult> {
    Logger.instance.info(`Neue Anfrage zur Prozessausführung ${args.id}`);


    if (this.exists(args.id)) {
      let msg = `Ein Prozess mit id "${args.id}" exisitiert bereits.`;
      Logger.instance.error(msg);
      throw new Error(msg);
    }
    let cmd = args.cmd;
    if (args.args) {
      cmd += ' ' + args.args.join(' ');
    }
    let msg = `Starte Prozess mit id "${args.id}"`;
    if (args.options) {
      msg += ` in "${args.options.cwd}"`;
    }
    msg += `: ${cmd}`;
    Logger.instance.debug(msg);
    return new Promise((resolve, reject) => {
      const command = spawn(args.cmd, args.args, args.options);
      const ret = new SpawnResult(command.pid);
      command.stdout.on('data', (data: any) => {
        ret.stdout += data;
      });
      command.stderr.on('data', (data: any) => {
        ret.stderr += data;
      });
      command.on('error', (err: Error) => {
        ret.error = err;
      });
      command.once('close', (code: number, signal: string) => {
        ret.status = code;
        ret.signal = signal;
        this.remove(args.id);
        let msg = `Prozessausführung "${args.id}" mit Code "${
            code}" und Signal "${signal}" beendet`;
        if (ret.isFailed()) {
          Logger.instance.error(msg);
          if (!ret.error) {
            ret.error = new Error(ret.stderr);
          }
          reject(ret);
        } else {
          Logger.instance.debug(msg);
          resolve(ret);
        }
      });
      let token = <SpawnTokenI>{
        cancel: () => {
          try {
            command.stdin.end();
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
