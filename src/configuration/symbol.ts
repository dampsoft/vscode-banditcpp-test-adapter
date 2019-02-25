import {homedir} from 'os';
import * as vscode from 'vscode';

type CallableSymbolResolver = (p: RegExpMatchArray) => string|undefined;
type Symbol = RegExp;
type SymbolMap = [Symbol, string | CallableSymbolResolver][];


/**
 * Interface für einen SymbolResolver
 */
export interface SymbolResolverI {
  resolve(value: any): any;
}

/**
 * Löst einen Wert mit Hilfe mehrerer SymbolResolver auf.
 * @param value      aufzulösender Wert
 * @param resolvers  Array von SymbolResolver-Instanzen
 * @returns          Gibt den aufgelösten Wert zurück
 */
export function resolve(value: any, resolvers: SymbolResolverI[]): any {
  return resolvers.reduce((resolved, r) => {
    return r.resolve(resolved);
  }, value);
}

/**
 * Basis-Klasse für Klassen zur Symbolauflösungen
 */
abstract class BaseSymbolResolver implements SymbolResolverI {
  public resolve(value: any): any {
    if (typeof value === 'string') {
      return this.resolveString(value);
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

  protected abstract resolveString(value: string): string;
}

/**
 * Klasse zum Auflösen von Symbolen auf Basis konstanter Werte und des
 * VC-Arbeitsverzeichnisses
 */
export class SymbolResolver extends BaseSymbolResolver {
  constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {
    super();
  }

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

  protected resolveString(value: string): string {
    for (let i = 0; i < this.symbols.length; ++i) {
      let match: RegExpMatchArray|null;
      let replaced = '';
      let lastAppend = 0;
      while ((match = this.symbols[i][0].exec(value)) != null) {
        let replacement: string|undefined;
        if (typeof this.symbols[i][1] === 'string') {
          replacement = this.symbols[i][1] as string;
        } else {
          replacement = (this.symbols[i][1] as CallableSymbolResolver)(match);
        }
        replaced +=
            value.substring(lastAppend, match.index) + (replacement || '');
        lastAppend = this.symbols[i][0].lastIndex;
      }
      replaced += value.substring(lastAppend);
      value = replaced;
    }
    return value;
  }
}