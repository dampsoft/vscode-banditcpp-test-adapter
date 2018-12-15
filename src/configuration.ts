
import * as path from 'path';
import * as vscode from 'vscode';
import {BanditSpawnerConfiguration} from './bandit'
import {VariableResolver} from './helper';

export class BanditConfiguration implements BanditSpawnerConfiguration {
  private resolver = new VariableResolver(this.workspaceFolder);
  // Konstruktor
  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {}

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        'banditTestExplorer', this.workspaceFolder.uri);
  }

  public get cmd(): string {
    const configExe =
        this.resolver.resolve(this.config.get<string>('executable'));
    if (path.isAbsolute(configExe)) {
      return configExe;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configExe);
    }
  }

  public get cwd(): string {
    const dirname = this.workspaceFolder.uri.fsPath;
    const configCwd =
        this.resolver.resolve(this.config.get<string>('cwd', dirname));
    if (path.isAbsolute(configCwd)) {
      return configCwd;
    } else {
      return path.resolve(this.workspaceFolder.uri.fsPath, configCwd);
    }
  }

  public get env(): NodeJS.ProcessEnv {
    const processEnv = process.env;
    const configEnv: {[prop: string]: any} = this.config.get('env') || {};

    const resultEnv = {...processEnv};

    for (const prop in configEnv) {
      const val = configEnv[prop];
      if ((val === undefined) || (val === null)) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = String(val);
      }
    }

    return resultEnv;
  }

  public get args(): string[] {
    var args = this.config.get<string[]>('arguments');
    if (args) {
      var args_modified = new Array<string>();
      for (let arg of args) {
        if (arg.trim().length > 0) {
          if (arg.trim().indexOf(' ') >= 0) {
            arg = '"' + arg.trim() + '"';
          }
          args_modified.push(arg.trim());
        }
      }
      return args_modified;
    } else {
      return [];
    }
  }
}