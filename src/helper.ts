import * as p from 'path'
import * as vscode from 'vscode';
import {Log} from 'vscode-test-adapter-util';

export function escapeRegExp(text: string): string {
  return text.replace(
      /[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
}

export class VariableResolver {
  private readonly variableToValue: [string, string][] = [
    ['${workspaceDirectory}', this.workspaceFolder.uri.fsPath],
    ['${workspaceFolder}', this.workspaceFolder.uri.fsPath]
  ];

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public resolve(value: any): any {
    return this.resolveVariables(value, this.variableToValue);
  }

  private resolveVariables(value: any, varValue: [string, any][]): any {
    if (typeof value == 'string') {
      for (let i = 0; i < varValue.length; ++i) {
        if (value === varValue[i][0] && typeof varValue[i][1] != 'string') {
          return varValue[i][1];
        }
        value = value.replace(varValue[i][0], varValue[i][1]);
      }
      return value;
    } else if (Array.isArray(value)) {
      return (<any[]>value).map((v: any) => this.resolveVariables(v, varValue));
    } else if (typeof value == 'object') {
      const newValue: any = {};
      for (const prop in value) {
        newValue[prop] = this.resolveVariables(value[prop], varValue);
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