import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import {LogLevel} from '../util/logger';

import {EnvProperty, mergeEnv} from './environment';
import {SymbolResolver} from './symbol';

export type Property =|'testsuites'|'parallelProcessLimit'|'watchTimeoutSec'|
    'allowKillProcess'|'loglevel';
export const PropertyTestsuites: Property = 'testsuites';
export const PropertyParallelProcessLimit: Property = 'parallelProcessLimit';
export const PropertyWatchTimeoutSec: Property = 'watchTimeoutSec';
export const PropertyAllowKillProcess: Property = 'allowKillProcess';
export const PropertyLoglevel: Property = 'loglevel';

interface TestSuiteJsonConfigurationI {
  name: string;
  cmd: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
  allowKillProcess?: boolean;
  parallelProcessLimit?: number;
}

export class TestSuiteConfiguration {
  constructor(
      private readonly parentConfig: Configuration,
      private readonly jsonConfig: TestSuiteJsonConfigurationI) {
    if (jsonConfig.cwd) {
      jsonConfig.cwd = this.parentConfig.resolvePath(jsonConfig.cwd);
    }
    jsonConfig.cmd =
        this.parentConfig.resolvePath(jsonConfig.cmd, jsonConfig.cwd);
    let watches = new Array<string>();
    if (jsonConfig.watches) {
      for (let watch of jsonConfig.watches) {
        watches.push(this.parentConfig.resolvePath(watch, jsonConfig.cwd));
      }
    }
    jsonConfig.watches = watches;
  }

  public get name() {
    return this.jsonConfig.name;
  }

  public get cmd() {
    return this.jsonConfig.cmd;
  }

  public get cwd() {
    return this.jsonConfig.cwd || this.parentConfig.cwd;
  }

  public get options() {
    return this.jsonConfig.options;
  }

  public get watches() {
    return this.parentConfig.resolveOptions(this.jsonConfig.options);
  }

  public get env() {
    return this.parentConfig.resolveEnv(this.jsonConfig.env);
  }

  public get parallelProcessLimit(): number {
    return this.jsonConfig.parallelProcessLimit ||
        this.parentConfig.parallelProcessLimit;
  }

  public get watchTimeoutSec(): number {
    return this.parentConfig.watchTimeoutSec;
  }

  public get allowKillProcess(): boolean {
    return this.jsonConfig.allowKillProcess ||
        this.parentConfig.allowKillProcess;
  }
}

export class Configuration {
  private symbolResolver = new SymbolResolver(this.workspaceFolder);
  private propertyGetter = new Map<string, () => any>();
  private testSuiteConfigs = new Array<TestSuiteConfiguration>();

  constructor(
      public readonly baseConfigurationName: string,
      public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.propertyGetter.set(PropertyTestsuites, () => {
      return this.testSuiteConfigs;
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

  public get testsuites(): TestSuiteConfiguration[] {
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

  public get cwd(): string {
    return this.workspaceFolder.uri.fsPath;
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
    let jsonConfig: TestSuiteJsonConfigurationI[] = [];
    if (typeof conf === 'string') {
      try {
        jsonConfig = fs.readJsonSync(this.resolvePath(conf));
      } catch (e) {
      }
    } else {
      jsonConfig = conf as TestSuiteJsonConfigurationI[];
    }
    this.testSuiteConfigs =
        jsonConfig.map((config) => new TestSuiteConfiguration(this, config));
  }

  public resolvePath(p: string|undefined, cwd?: string): string {
    if (!p) return '';
    let resolved: string = this.symbolResolver.resolve(p);
    if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(cwd || this.cwd, resolved);
    }
    resolved = path.normalize(resolved);
    return resolved;
  }

  public resolveOptions(options: string[]|undefined): string[] {
    if (options) {
      var args_modified = new Array<string>();
      for (let arg of options) {
        arg = this.symbolResolver.resolve(arg);
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

  public resolveEnv(env: EnvProperty|undefined): EnvProperty {
    let resolvedEnv: EnvProperty = {};
    const configEnv: EnvProperty = env || {};
    for (const e in configEnv) {
      if (configEnv[e]) {
        resolvedEnv[e] = this.symbolResolver.resolve(String(configEnv[e]));
      }
    }
    return mergeEnv(process.env, resolvedEnv);
  }
}
