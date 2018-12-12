
import {ChildProcess, spawn, SpawnOptions, SpawnSyncReturns} from 'child_process';

export type SpawnReturns = SpawnSyncReturns<string>;

export class Spawner {
  private spawnedProcesses = new Map<string, ChildProcess>();

  constructor() {}

  spawnAsync(id: string, cmd: string, args?: string[], options?: SpawnOptions):
      Promise<SpawnReturns>{return new Promise((resolve, reject) => {
        if (this.exists(id)) {
          return;
        }
        const ret: SpawnReturns = {
          pid: 0,
          output: ['', ''],
          stdout: '',
          stderr: '',
          status: 0,
          signal: '',
          error: new Error()
        };
        const command = spawn(cmd, args, options);
        ret.pid = command.pid;
        command.stdout.on('data', (data) => {
          ret.stdout += data;
          ret.output[0] = ret.stdout;
        });
        command.on('error', (err: Error) => {
          ret.error = err;
          reject(ret);
        });
        command.on('close', (code) => {
          ret.status = code;
          ret.error = new Error('code: ' + String(code));
          resolve(ret);
          this.kill(id);
        });
        this.spawnedProcesses.set(id, command);
      })}

  exists(id: string): boolean {
    return this.spawnedProcesses.get(id) !== undefined;
  }

  kill(id: string): void {
    var process = this.spawnedProcesses.get(id);
    if (process) {
      process.kill();
      this.spawnedProcesses.delete(id);
    }
  }

  killAll(): void {
    var processes = this.spawnedProcesses;
    processes.forEach((value: ChildProcess, key: string) => {
      this.kill(key);
    });
  }
}