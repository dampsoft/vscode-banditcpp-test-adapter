
import {spawn, SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns} from 'child_process';
import {BanditConfiguration} from './configuration'

export type SpawnReturns = SpawnSyncReturns<string>;

export type SpawnArguments = {
  id: string,
  cmd: string,
  args?: string[],
  options?: SpawnSyncOptionsWithStringEncoding
};

interface SpawnToken {
  cancel(): void;
}

export class Spawner {
  constructor(
      private readonly config: BanditConfiguration,
      private readonly max_timeout?: number|undefined) {}

  private spawnedProcesses = new Map<string, SpawnToken>();
  private kill_pending: boolean = false;

  public async spawn(args: SpawnArguments): Promise<SpawnReturns> {
    this.kill_pending = false;
    return await this.spawnPending(args, 0);
  }

  private async spawnPending(args: SpawnArguments, timeouts: number):
      Promise<SpawnReturns> {
    if (this.max_timeout && timeouts > this.max_timeout) {
      throw new Error('Timeout beim Aufruf vob spawn().');
    } else if (this.count >= this.config.maxParallelProcess) {
      return new Promise<void>((resolve, reject) => {
               if (this.kill_pending) {
                 reject(new Error('Der Prozess wurde unterbrochen.'));
               } else {
                 setTimeout(resolve, 64);
               }
             })
          .then(() => {
            return this.spawnPending(args, ++timeouts);
          });
    } else if (this.kill_pending) {
      throw new Error('Der Prozess wurde unterbrochen.');
    } else {
      return this.spawnInner(args);
    }
  }

  private spawnInner(args: SpawnArguments): Promise<SpawnReturns> {
    if (this.exists(args.id)) {
      throw new Error(
          'Ein Prozess mit id "' + args.id + '" exisitiert bereits.');
    }
    return new Promise<SpawnReturns>((resolve, reject) => {
      const ret: SpawnReturns = {
        pid: 0,
        output: ['', ''],
        stdout: '',
        stderr: '',
        status: 0,
        signal: '',
        error: new Error()
      };
      const command = spawn(args.cmd, args.args, args.options);
      ret.pid = command.pid;
      command.stdout.on('data', (data) => {
        ret.stdout += data;
        ret.output[0] = ret.stdout;
      });
      command.on('error', (err: Error) => {
        ret.error = err;
        reject(ret);
        this.kill(args.id);
      });
      command.on('close', (code) => {
        ret.status = code;
        ret.error = new Error('code: ' + String(code));
        resolve(ret);
        this.kill(args.id);
      });
      let token = <SpawnToken>{
        cancel: () => {
          try {
            command.kill();
          } catch (e) {
          }
          reject(new Error('Der Prozess wurde beendet.'));
        }
      };
      this.spawnedProcesses.set(args.id, token);
    });
  }

  public get count(): number {
    return this.spawnedProcesses.size;
  }

  exists(id: string): boolean {
    return this.spawnedProcesses.get(id) !== undefined;
  }

  kill(id: string): void {
    var process = this.spawnedProcesses.get(id);
    if (process) {
      process.cancel();
    }
    this.spawnedProcesses.delete(id);
  }

  killAll(): void {
    this.kill_pending = true;
    var processes = this.spawnedProcesses;
    processes.forEach((value: SpawnToken, key: string) => {
      this.kill(key);
    });
  }
}