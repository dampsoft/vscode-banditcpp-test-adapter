import {homedir} from 'os';
import * as p from 'path';
import * as vscode from 'vscode';

export function escapeRegExp(text: string): string {
  return text.replace(
      /[.*+?^${}()|[\]\\]/g, '\\$&');  // $& means the whole matched string
}

type CallableSymbolResolver = (p: RegExpMatchArray) => string|undefined;
type SymbolResolver = string|CallableSymbolResolver;
type Symbol = RegExp;
type SymbolMap = [Symbol, SymbolResolver][];

export class VariableResolver {
  private readonly varValue: SymbolMap = [
    [/\${workspaceDirectory}/, this.workspaceFolder.uri.fsPath],
    [/\${workspaceFolder}/, this.workspaceFolder.uri.fsPath],
    [/\${User}/, homedir()], [/~($|\/|\\)/, `${homedir()}$1`],
    [
      /\${env:(\w+)}/,
      (matches: RegExpMatchArray) => {
        if (matches && matches.length > 0) {
          return process.env[matches[1]];
        }
        return undefined;
      }
    ]
  ];

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public resolve(value: any): any {
    return this.resolveVariables(value);
  }

  private resolveVariables(value: any): any {
    if (typeof value === 'string') {
      let strValue = value as string;
      for (let i = 0; i < this.varValue.length; ++i) {
        let matches = strValue.match(this.varValue[i][0]);
        if (matches && matches.length > 0) {
          let replacement: string|undefined;
          if (typeof this.varValue[i][1] === 'string') {
            replacement = this.varValue[i][1] as string;
          } else {
            replacement =
                (this.varValue[i][1] as CallableSymbolResolver)(matches);
          }
          // Regex:
          strValue = strValue.replace(this.varValue[i][0], replacement || '');
        }
      }
      return strValue;
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
  let h = Math.floor((millis / (1000 * 60 * 60)) % 24);
  if (h) {
    return `${(millis / (1000 * 60 * 60 / 24)).toFixed(3)} h`;
  } else {
    let m = Math.floor((millis / (1000 * 60)) % 60);
    if (m) {
      return `${(millis / (1000 * 60 * 60)).toFixed(3)} min`;
    } else {
      return `${(millis / (1000 * 60)).toFixed(3)} s`;
    }
  }
}

export function isWindows() {
  return /^win/.test(process.platform);
}
