import {homedir} from 'os';
import * as p from 'path'
import * as vscode from 'vscode';
import {Log} from 'vscode-test-adapter-util';

export function escapeRegExp(text: string): string {
  return text.replace(
      /[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
}

export class VariableResolver {
  private readonly varValue: [string|RegExp, string][] = [
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath],  //
    ['${Home}', homedir()],                                   //
    [/^~($|\/|\\)/, `${homedir()}$1`]
  ];

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public resolve(value: any): any {
    return this.resolveVariables(value);
  }

  private resolveVariables(value: any): any {
    if (typeof value === 'string') {
      for (let i = 0; i < this.varValue.length; ++i) {
        if (typeof this.varValue[i][0] === 'string' &&
            typeof this.varValue[i][1] != 'string' &&
            value === this.varValue[i][0]) {
          return this.varValue[i][1];
        }
        value = value.replace(this.varValue[i][0], this.varValue[i][1]);
      }
      return value;
    } else if (Array.isArray(value)) {
      return (<any[]>value).map((v: any) => this.resolveVariables(v));
    } else if (typeof value == 'object') {
      const newValue: any = {};
      for (const prop in value) {
        newValue[prop] = this.resolveVariables(value[prop]);
      }
      return newValue;
    }
    return value;
  }
}

export function cleanPath(path: string): string {
  return p.normalize(path);
}

export function flatten<T>(array: Array<Array<T>>): Array<T> {
  return new Array<T>().concat(...array);
}

export function removeDuplicates(values: any[], prop: string) {
  return values.filter((obj, pos, arr) => {
    return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
  });
}

export function formatTimeDuration(millis: number): string {
  let date = new Date(millis);
  let h = date.getHours();
  let m = date.getMinutes();
  let s = date.getSeconds();
  let ms = date.getMilliseconds();
  return `${h}:${m}:${s},${ms}`;
}

export class Logger {
  constructor(private readonly log: Log) {}
  public info(message: string) {
    if (this.log.enabled) {
      this.log.info(message);
    }
  }
  public warn(message: string) {
    if (this.log.enabled) {
      this.log.warn(message);
    }
  }
  public error(message: string) {
    if (this.log.enabled) {
      this.log.error(message);
    }
  }
  public debug(message: string) {
    if (this.log.enabled) {
      this.log.debug(message);
    }
  }
  public dispose() {
    this.log.dispose();
  }
}