import * as cp from "child_process";
const { spawn } = require("child_process");

import { Logger } from "./logger";

export interface SpawnReturnsI extends cp.SpawnSyncReturns<string> {
  cancelled?: boolean;
}

export type SpawnArguments = {
  id: string;
  cmd: string;
  args?: string[];
  options?: cp.SpawnSyncOptions;
};

interface SpawnTokenI {
  cancel(): void;
}

export class Spawner {
  public static readonly instance = new Spawner();

  private spawnedProcesses = new Map<string, SpawnTokenI>();

  public spawn(args: SpawnArguments): Promise<SpawnReturnsI> {
    Logger.instance.info(`Neue Anfrage zur Prozessausführung ${args.id}`);

    if (this.exists(args.id)) {
      let msg = `Ein Prozess mit id "${args.id}" exisitiert bereits.`;
      Logger.instance.error(msg);
      throw new Error(msg);
    }
    let cmd = args.cmd;
    if (args.args) {
      cmd += " " + args.args.join(" ");
    }
    let msg = `Starte Prozess mit id "${args.id}": ${cmd}`;
    Logger.instance.info(msg);
    return new Promise(resolve => {
      const ret: SpawnReturnsI = {
        pid: 0,
        stdout: "",
        stderr: "",
        output: ["", ""],
        status: 0,
        signal: "",
        error: new Error()
      };
      const command = spawn(args.cmd, args.args, args.options);
      ret.pid = command.pid;

      command.stdout.on("data", (data: any) => {
        ret.stdout += data;
      });
      command.stderr.on("data", (data: any) => {
        ret.stderr += data;
      });
      command.on("error", (err: Error) => {
        ret.error = err;
        let msg = `Fehler bei der Prozessausführung "${args.id}": ${
          err.message
        }`;
        Logger.instance.error(msg);
        ret.error = err;
        this.remove(args.id);
        resolve(ret);
      });
      command.once("close", (code: number, signal: string) => {
        ret.status = code;
        let msg = `Prozessausführung "${
          args.id
        }" mit Code "${code}" und Signal "${signal}" beendet`;
        Logger.instance.info(msg);
        ret.error = new Error(msg);
        ret.signal = signal;
        this.remove(args.id);
        resolve(ret);
      });
      let token = <SpawnTokenI>{
        cancel: () => {
          try {
            command.stdin.end();
            command.stdout.pause();
            command.kill();
          } catch (e) {}
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
