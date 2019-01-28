
import * as fs from 'fs-extra'
import * as path from 'path';
import * as vscode from 'vscode';

import {cleanPath, VariableResolver} from './helper';

export type Property = 'cwd'|'testsuites'|'parallelProcessLimit'|
    'watchTimeoutSec'|'allowKillProcess';
export const cwd: Property = 'cwd';
export const testsuites: Property = 'testsuites';
export const parallelProcessLimit: Property = 'parallelProcessLimit';
export const watchTimeoutSec: Property = 'watchTimeoutSec';
export const allowKillProcess: Property = 'allowKillProcess';

export type EnvProperty = {
  [prop: string]: any
};
interface TestSuiteJsonConfigurationI {
  name: string;
  cmd: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
}

export interface BanditTestSuiteConfigurationI {
  name: string;
  cmd: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
  readonly parallelProcessLimit: number;
  readonly watchTimeoutSec: number;
  readonly allowKillProcess: boolean;
  readonly maxTimeouts?: number;
}

export interface BanditConfigurationI {
  readonly testsuites: BanditTestSuiteConfigurationI[];
  readonly parallelProcessLimit: number;
  readonly watchTimeoutSec: number;
  readonly allowKillProcess: boolean;
  readonly properties: Property[];
  get(property: Property): any|undefined;
  name(property: Property): string;
  fullname(property: Property): string;
}

export class Configuration implements BanditConfigurationI {
  private resolver = new VariableResolver(this.workspaceFolder);
  private propertyGetter = new Map<string, () => any>();

  public baseConfigurationName: string = 'banditTestExplorer';

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.propertyGetter.set(testsuites, () => {
      let conf =
          this.config.get<string|TestSuiteJsonConfigurationI[]>(testsuites);
      let banditConfig: TestSuiteJsonConfigurationI[] = [];
      if (typeof conf === 'string') {
        try {
          banditConfig = fs.readJsonSync(this.resolvePath(conf));
        } catch (e) {
        }
      } else {
        banditConfig = conf as TestSuiteJsonConfigurationI[];
      }
      // Resolve variables and paths:
      for (let testsuite of banditConfig) {
        testsuite.cmd = this.resolvePath(testsuite.cmd);
        testsuite.cwd =
            testsuite.cwd ? this.resolvePath(testsuite.cwd) : this.get(cwd);
        testsuite.env = this.resolveEnv(testsuite.env);
        testsuite.options = this.resolveOptions(testsuite.options);
        let watches = new Array<string>();
        if (testsuite.watches) {
          for (let watch of testsuite.watches) {
            watches.push(this.resolvePath(watch));
          }
        }
        testsuite.watches = watches;
      }
      let banditTestSuiteConfigs = new Array<BanditTestSuiteConfigurationI>();
      for (let config of banditConfig) {
        banditTestSuiteConfigs.push({
          name: config.name,
          cmd: config.cmd,
          cwd: config.cwd,
          env: config.env,
          options: config.options,
          watches: config.watches,
          parallelProcessLimit: this.parallelProcessLimit,
          allowKillProcess: this.allowKillProcess,
          watchTimeoutSec: this.watchTimeoutSec
        } as BanditTestSuiteConfigurationI);
      }
      return banditTestSuiteConfigs;
    });

    this.propertyGetter.set(parallelProcessLimit, () => {
      return this.config.get<number>(parallelProcessLimit, 1);
    });

    this.propertyGetter.set(watchTimeoutSec, () => {
      return this.config.get<number>(watchTimeoutSec, 10);
    });

    this.propertyGetter.set(allowKillProcess, () => {
      return this.config.get<boolean>(allowKillProcess, false);
    });

    this.propertyGetter.set(cwd, () => {
      return this.resolvePath(
          this.config.get<string>(cwd, this.workspaceFolder.uri.fsPath));
    });
  }

  public get(property: Property): any|undefined {
    let prop = this.propertyGetter.get(property);
    if (prop) {
      return prop();
    } else {
      return undefined;
    }
  }

  public get testsuites(): BanditTestSuiteConfigurationI[] {
    return this.get(testsuites);
  }

  public get parallelProcessLimit(): number {
    return this.get(parallelProcessLimit);
  }

  public get watchTimeoutSec(): number {
    return this.get(watchTimeoutSec);
  }

  public get allowKillProcess(): boolean {
    return this.get(allowKillProcess);
  }

  public get properties(): Property[] {
    return [
      testsuites, watchTimeoutSec, parallelProcessLimit, allowKillProcess
    ];
  }

  public name(property: Property): string {
    return property;
  }

  public fullname(property: Property): string {
    return this.baseConfigurationName + '.' + this.name(property);
  }

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        this.baseConfigurationName, this.workspaceFolder.uri);
  }

  private resolvePath(p: string|undefined): string {
    const resolved: string = p ? this.resolver.resolve(p) : '';
    if (path.isAbsolute(resolved)) {
      return cleanPath(resolved);
    } else {
      return cleanPath(path.resolve(this.workspaceFolder.uri.fsPath, resolved));
    }
  }

  private resolveOptions(options: string[]|undefined): string[] {
    if (options) {
      var args_modified = new Array<string>();
      for (let arg of options) {
        arg = this.resolver.resolve(arg);
        if (arg.trim().length > 0) {
          if (arg.trim().indexOf(' ') >= 0 && arg.trim().indexOf('"') < 0) {
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

  private resolveEnv(env: EnvProperty|undefined): EnvProperty {
    const processEnv = process.env;
    const configEnv: EnvProperty = env || {};
    const resultEnv = {...processEnv};
    for (const prop in configEnv) {
      const val = configEnv[prop];
      if ((val === undefined) || (val === null)) {
        delete resultEnv.prop;
      } else {
        resultEnv[prop] = this.resolver.resolve(String(val));
      }
    }
    return resultEnv;
  }
}