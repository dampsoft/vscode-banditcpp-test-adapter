import * as cp from 'child_process';

import { Messages } from './messages';

export class SpawnResult {
  constructor(
    public pid: number = 0, public stdout: string = '',
    public stderr: string = '', public status: number = 0,
    public signal: string = '', public cancelled: boolean = false) { }
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
    Messages.getSpawnerProcessRequest(args.id).log();
    if (this.exists(args.id)) {
      let msg = Messages.getSpawnerProcessIdAlreadyExists(args.id);
      msg.log();
      throw new Error(msg.format());
    }
    Messages
      .getSpawnerProcessStart(
        args.id, args.cmd + (args.args ? ' ' + args.args.join(' ') : ''))
      .log();
    return new Promise((resolve, reject) => {
      const command = cp.spawn(args.cmd, args.args || [], args.options || {});
      const ret = new SpawnResult(command.pid);
      if (command.stdout) {
        command.stdout.on('data', (data: any) => {
          ret.stdout += data;
        });
      }
      if (command.stderr) {
        command.stderr.on('data', (data: any) => {
          ret.stderr += data;
        });
      }
      command.on('error', (err: Error) => {
        ret.error = err;
      });
      command.once('close', (code: number, signal: string) => {
        ret.status = code;
        ret.signal = signal;
        this.remove(args.id);
        if (ret.isFailed()) {
          Messages.getSpawnerProcessFinishedInvalid(args.id, signal, code)
            .log();
          if (!ret.error) {
            ret.error = new Error(ret.stderr);
          }
          reject(ret);
        } else {
          Messages.getSpawnerProcessFinishedValid(args.id, signal, code).log();
          resolve(ret);
        }
      });
      let token = <SpawnTokenI>{
        cancel: () => {
          try {
            if (command.stdin) command.stdin.end();
            if (command.stdout) command.stdout.pause();
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
