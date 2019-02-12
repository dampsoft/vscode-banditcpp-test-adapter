
import * as fs from 'fs-extra'
import * as path from 'path';
import * as vscode from 'vscode';

import {cleanPath, VariableResolver} from './helper';
import {LogLevel} from './logger'

export type Property = 'cwd'|'testsuites'|'parallelProcessLimit'|
    'watchTimeoutSec'|'allowKillProcess'|'loglevel';
export const PropertyCwd: Property = 'cwd';
export const PropertyTestsuites: Property = 'testsuites';
export const PropertyParallelProcessLimit: Property = 'parallelProcessLimit';
export const PropertyWatchTimeoutSec: Property = 'watchTimeoutSec';
export const PropertyAllowKillProcess: Property = 'allowKillProcess';
export const PropertyLoglevel: Property = 'loglevel';

export type EnvProperty = {
  [prop: string]: string|undefined
}

interface TestSuiteJsonConfigurationI {
  name: string;
  cmd: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
}

export class BanditTestSuiteConfiguration {
  constructor(
      private readonly parentConfig: Configuration,
      private readonly jsonConfig: TestSuiteJsonConfigurationI) {}

  public get name() {
    return this.jsonConfig.name;
  }

  public get cmd() {
    return this.jsonConfig.cmd;
  }

  public get cwd() {
    return this.jsonConfig.cwd;
  }

  public get options() {
    return this.jsonConfig.options;
  }

  public get watches() {
    return this.jsonConfig.watches;
  }

  public get env() {
    return this.jsonConfig.env;
  }

  public get parallelProcessLimit(): number {
    return this.parentConfig.parallelProcessLimit;
  }

  public get watchTimeoutSec(): number {
    return this.parentConfig.watchTimeoutSec;
  }

  public get allowKillProcess(): boolean {
    return this.parentConfig.allowKillProcess;
  }
}

export class Configuration {
  private resolver = new VariableResolver(this.workspaceFolder);
  private propertyGetter = new Map<string, () => any>();
  private banditTestSuiteConfigs = new Array<BanditTestSuiteConfiguration>();

  public baseConfigurationName: string = 'banditTestExplorer';

  constructor(public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.propertyGetter.set(PropertyTestsuites, () => {
      return this.banditTestSuiteConfigs;
    });

    this.propertyGetter.set(PropertyParallelProcessLimit, () => {
      return this.config.get<number>(PropertyParallelProcessLimit, 1);
    });

    this.propertyGetter.set(PropertyWatchTimeoutSec, () => {
      return this.config.get<number>(PropertyWatchTimeoutSec, 10);
    });

    this.propertyGetter.set(PropertyAllowKillProcess, () => {
      return this.config.get<boolean>(PropertyAllowKillProcess, false);
    });

    this.propertyGetter.set(PropertyLoglevel, () => {
      return this.config.get<LogLevel>(PropertyLoglevel, 'error');
    });

    this.propertyGetter.set(PropertyCwd, () => {
      return this.resolvePath(this.config.get<string>(
          PropertyCwd, this.workspaceFolder.uri.fsPath));
    });

    this.reload();
  }

  public reload() {
    this.initTestSuiteConfigs();
  }

  public get(property: Property): any|undefined {
    let prop = this.propertyGetter.get(property);
    if (prop) {
      return prop();
    } else {
      return undefined;
    }
  }

  public get testsuites(): BanditTestSuiteConfiguration[] {
    return this.get(PropertyTestsuites);
  }

  public get parallelProcessLimit(): number {
    return this.get(PropertyParallelProcessLimit);
  }

  public get watchTimeoutSec(): number {
    return this.get(PropertyWatchTimeoutSec);
  }

  public get allowKillProcess(): boolean {
    return this.get(PropertyAllowKillProcess);
  }

  public get loglevel(): LogLevel {
    return this.get(PropertyLoglevel);
  }

  public get properties(): Property[] {
    return [
      PropertyTestsuites, PropertyWatchTimeoutSec, PropertyParallelProcessLimit,
      PropertyAllowKillProcess, PropertyLoglevel
    ];
  }

  public get propertiesSoftReset(): Property[] {
    return [
      PropertyWatchTimeoutSec, PropertyParallelProcessLimit,
      PropertyAllowKillProcess, PropertyLoglevel
    ];
  }

  public get propertiesHardReset(): Property[] {
    return [PropertyTestsuites];
  }

  public name(property: Property): string {
    return property;
  }

  public fullname(property: Property): string {
    return `${this.baseConfigurationName}.${this.name(property)}`;
  }

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(
        this.baseConfigurationName, this.workspaceFolder.uri);
  }

  private initTestSuiteConfigs() {
    let conf = this.config.get<string|TestSuiteJsonConfigurationI[]>(
        PropertyTestsuites);
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
      testsuite.cwd = testsuite.cwd ? this.resolvePath(testsuite.cwd) :
                                      this.get(PropertyCwd);
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
    this.banditTestSuiteConfigs = [];
    for (let config of banditConfig) {
      this.banditTestSuiteConfigs.push(
          new BanditTestSuiteConfiguration(this, config));
    }
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
            arg = `"${arg.trim()}"`;
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
    /*
    let merge =
        (a: string|undefined, b: string|undefined): string|undefined => {
          return a ? (b ? [a, b].join(';') : a) : b;
        };
    const processEnv = process.env;
    const configEnv: EnvProperty = env || {};
    const resultEnv = {...processEnv};
    let propsProcess = Object.keys(processEnv);
    for (const prop in configEnv) {
      const val: string|undefined =
          this.resolver.resolve(String(configEnv[prop]));
      if (propsProcess.indexOf(prop) >= 0) {
        resultEnv[prop] = merge(resultEnv[prop], val);
      } else {
        resultEnv[prop] = val;
      }
    }
    return resultEnv;
     */
  }
}