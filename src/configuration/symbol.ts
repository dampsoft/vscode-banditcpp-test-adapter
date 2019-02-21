import {homedir} from 'os';
import * as vscode from 'vscode';

type CallableSymbolResolver = (p: RegExpMatchArray) => string|undefined;
type Symbol = RegExp;
type SymbolMap = [Symbol, string | CallableSymbolResolver][];

export class SymbolResolver {
  private readonly symbols: SymbolMap = [
    [/\${workspaceDirectory}/g, this.workspaceFolder.uri.fsPath],
    [/\${workspaceFolder}/g, this.workspaceFolder.uri.fsPath],
    [/\${UserDir}/g, homedir()], [/\${HomeDir}/g, homedir()],
    [/~(?=$|\/|\\)/g, homedir()],
    [
      /\${env:(\w+)}/g,
      (matches: RegExpMatchArray) => {
        if (matches && matches.length > 0) {
          return process.env[matches[1]];
        }
        return undefined;
      }
    ]
  ];

  constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {}

  public resolve(value: any): any {
    if (typeof value === 'string') {
      let strValue = value as string;
      for (let i = 0; i < this.symbols.length; ++i) {
        let match: RegExpMatchArray|null;
        let replaced = '';
        let lastAppend = 0;
        while ((match = this.symbols[i][0].exec(strValue)) != null) {
          let replacement: string|undefined;
          if (typeof this.symbols[i][1] === 'string') {
            replacement = this.symbols[i][1] as string;
          } else {
            replacement = (this.symbols[i][1] as CallableSymbolResolver)(match);
          }
          replaced +=
              strValue.substring(lastAppend, match.index) + (replacement || '');
          lastAppend = this.symbols[i][0].lastIndex;
        }
        replaced += strValue.substring(lastAppend);
        strValue = replaced;
      }
      return strValue;
    } else if (Array.isArray(value)) {
      return (<any[]>value).map((v: any) => this.resolve(v));
    } else if (typeof value == 'object') {
      const newValue: any = {};
      for (const prop in value) {
        newValue[prop] = this.resolve(value[prop]);
      }
      return newValue;
    }
    return value;
  }
}