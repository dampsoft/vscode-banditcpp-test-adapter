import * as vscode from 'vscode';


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

export function flatten<T>(array: Array<Array<T>>): Array<T> {
  return new Array<T>().concat(...array);
}