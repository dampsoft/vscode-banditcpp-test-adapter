
import {ChildProcess, spawn, SpawnOptions, SpawnSyncReturns} from 'child_process';

export type SpawnReturns = SpawnSyncReturns<string>;

export type SpawnArguments = {
  id: string,
  cmd: string,
  args?: string[],
  options?: SpawnOptions
};

export class Spawner {
  private spawnedProcesses = new Map<string, ChildProcess>();

  constructor() {}

  spawnAsync(args: SpawnArguments): Promise<SpawnReturns>{
    return new Promise<SpawnReturns>((resolve, reject) => {
      if (this.exists(args.id)) {
        reject(new Error(
            'Ein Prozess mit id "' + args.id + '" exisitiert bereits.'));
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
      const command = spawn(args.cmd, args.args, args.options);
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
        this.kill(args.id);
      });
      this.spawnedProcesses.set(args.id, command);
    })
  }

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