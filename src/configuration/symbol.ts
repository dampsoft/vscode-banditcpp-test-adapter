import {homedir} from 'os';
import * as vscode from 'vscode';
const uuid = require('uuid/v4');

type CallableRegexSymbolResolver = (p: RegExpMatchArray) => string|undefined;
type CallableSymbolResolver = () => string|undefined;
type Symbol = RegExp;
type SymbolMap =
    [Symbol, string | CallableRegexSymbolResolver | CallableSymbolResolver][];

export interface SymbolValueProvider {}


/**
 * Interface für einen SymbolResolver
 */
export interface SymbolResolverI {
  readonly id: string;
  resolve(value: any): any;
}

/**
 * Löst einen Wert mit Hilfe mehrerer SymbolResolver auf.
 * @param value      aufzulösender Wert
 * @param resolvers  Array zu benutzender SymbolResolver
 * @returns          Gibt den aufgelösten Wert zurück
 */
export function resolveSymbols(value: any, resolvers: SymbolResolverI[]): any {
  return resolvers.reduce((resolved, r) => {
    return r.resolve(resolved);
  }, value);
}

/**
 * Symbol-Resolver zum Auflösen von Symbolen in einem Konfigurationswert
 */
export class SymbolResolver {
  private resolvers = new Map<string, SymbolResolverI>();

  /**
   * Fügt einen neuen SymbolResolver hinzu
   * @param resolver Neuer Resolver
   */
  public register(resolver: SymbolResolverI) {
    this.resolvers.set(resolver.id, resolver);
  }
  /**
   * Entfernt einen SymbolResolver
   * @param resolver Resolver, der entfernt werden soll
   */
  public remove(resolver: SymbolResolverI) {
    this.resolvers.delete(resolver.id);
  }

  /**
   * Löst einen Wert mit Hilfe mehrerer SymbolResolver auf.
   * @param value      aufzulösender Wert
   * @returns          Gibt den aufgelösten Wert zurück
   */
  public resolve(value: any): any {
    resolveSymbols(value, Array.from(this.resolvers.values()));
  }
}


/**
 * Basis-Klasse für Klassen zur Symbolauflösungen
 */
export abstract class BaseSymbolResolver implements SymbolResolverI {
  public readonly id: string = uuid();

  private readonly symbols: SymbolMap = [];

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

  private resolveString(value: string): string {
    for (let i = 0; i < this.symbols.length; ++i) {
      let match: RegExpMatchArray|null;
      let replaced = '';
      let lastAppend = 0;
      while ((match = this.symbols[i][0].exec(value)) != null) {
        let replacement: string|undefined;
        if (typeof this.symbols[i][1] === 'string') {
          replacement = this.symbols[i][1] as string;
        } else {
          let regexResolver =
              (this.symbols[i][1] as CallableRegexSymbolResolver);
          if (regexResolver) {
            replacement = regexResolver(match);
          } else {
            replacement = (this.symbols[i][1] as CallableSymbolResolver)();
          }
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

  protected registerSymbol(
      symbol: Symbol,
      resolver: string|CallableRegexSymbolResolver|CallableSymbolResolver) {
    this.symbols.push([symbol, resolver]);
  }
}

/**
 * Klasse zum Auflösen von Symbolen auf Basis konstanter Werte und des
 * VC-Arbeitsverzeichnisses
 */
export class WorkspaceSymbolResolver extends BaseSymbolResolver {
  constructor(private readonly workspaceFolder: vscode.WorkspaceFolder) {
    super();
    this.registerSymbol(
        /\${workspaceDirectory}/g, this.workspaceFolder.uri.fsPath);
    this.registerSymbol(
        /\${workspaceFolder}/g, this.workspaceFolder.uri.fsPath);
    this.registerSymbol(/\${UserDir}/g, homedir());
    this.registerSymbol(/\${HomeDir}/g, homedir());
    this.registerSymbol(/~(?=$|\/|\\)/g, homedir());
    this.registerSymbol(/\${env:(\w+)}/g, (matches: RegExpMatchArray) => {
      let result: string|undefined;
      if (matches && matches.length > 0) {
        result = process.env[matches[1]];
      }
      return result;
    });
  }
}