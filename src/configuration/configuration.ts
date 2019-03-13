import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import {switchOs} from '../util/helper';
import {LogLevel} from '../util/logger';

import {EnvProperty, mergeEnv} from './environment';
import {resolveSymbols, SymbolResolverI, WorkspaceSymbolResolver} from './symbol';

export type Property =|'testsuites'|'parallelProcessLimit'|'watchTimeoutSec'|
    'allowKillProcess'|'loglevel';
export const PropertyTestsuites: Property = 'testsuites';
export const PropertyParallelProcessLimit: Property = 'parallelProcessLimit';
export const PropertyWatchTimeoutSec: Property = 'watchTimeoutSec';
export const PropertyAllowKillProcess: Property = 'allowKillProcess';
export const PropertyLoglevel: Property = 'loglevel';

interface TestSuiteJsonPlatformConfigurationI {
  cmd?: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
  allowKillProcess?: boolean;
  parallelProcessLimit?: number;
}

interface TestSuiteJsonConfigurationI {
  name: string;
  cmd: string;
  cwd?: string;
  options?: string[];
  watches?: string[];
  env?: EnvProperty;
  allowKillProcess?: boolean;
  parallelProcessLimit?: number;
  windows?: TestSuiteJsonPlatformConfigurationI;
  linux?: TestSuiteJsonPlatformConfigurationI;
  osx?: TestSuiteJsonPlatformConfigurationI;
}

export class TestSuiteConfiguration {
  constructor(
      private readonly parentConfig: Configuration,
      private readonly jsonConfig: TestSuiteJsonConfigurationI) {
    this.resolveCwd();
    this.resolveCmd();
    this.resolveWatches();
  }

  public get name() {
    return this.jsonConfig.name;
  }

  public get cmd() {
    return this.jsonConfig.cmd;  // bereits aufgelöst
  }

  public get cwd() {
    return this.jsonConfig.cwd || this.parentConfig.cwd;  // bereits aufgelöst
  }

  public get options() {
    return this.resolveOptions();
  }

  public get watches() {
    return this.jsonConfig.watches;  // bereits aufgelöst
  }

  public get env() {
    return this.resolveEnv();
  }

  public get parallelProcessLimit(): number {
    return this.resolveParallelProcessLimit();
  }

  public get watchTimeoutSec(): number {
    return this.parentConfig.watchTimeoutSec;  // nur globale Einstellung
  }

  public get allowKillProcess(): boolean {
    return this.resolveAllowKillProcess();
  }

  private resolveCwd() {
    let cwd = switchOs<string>(this.jsonConfig, 'cwd');
    cwd = cwd || this.jsonConfig.cwd;
    if (cwd) {
      this.jsonConfig.cwd = this.parentConfig.resolvePath(cwd);
    }
  }

  private resolveCmd() {
    let cmd = switchOs<string>(this.jsonConfig, 'cmd');
    this.jsonConfig.cmd = this.parentConfig.resolvePath(
        cmd || this.jsonConfig.cmd, this.jsonConfig.cwd);
  }

  private resolveEnv() {
    let env = switchOs<EnvProperty>(this.jsonConfig, 'env');
    return this.parentConfig.resolveEnv(env || this.jsonConfig.env);
  }

  private resolveWatches() {
    let watches = switchOs<string[]>(this.jsonConfig, 'watches');
    watches = watches || this.jsonConfig.watches;
    if (watches) {
      this.jsonConfig.watches = watches.map(
          w => this.parentConfig.resolvePath(w, this.jsonConfig.cwd))
    } else {
      this.jsonConfig.watches = [];
    }
  }

  private resolveOptions() {
    let options = switchOs<string[]>(this.jsonConfig, 'options');
    return resolveSymbols(
        options || this.jsonConfig.options, [this.parentConfig.symbolResolver]);
  }

  private resolveParallelProcessLimit() {
    let parallelProcessLimit =
        switchOs<number>(this.jsonConfig, 'parallelProcessLimit');
    return parallelProcessLimit || this.jsonConfig.parallelProcessLimit ||
        this.parentConfig.parallelProcessLimit;
  }

  private resolveAllowKillProcess() {
    let allowKillProcess =
        switchOs<boolean>(this.jsonConfig, 'allowKillProcess');
    return allowKillProcess || this.jsonConfig.allowKillProcess ||
        this.parentConfig.allowKillProcess;
  }
}

export class Configuration {
  private propertyGetter = new Map<string, () => any>();
  private testSuiteConfigs = new Array<TestSuiteConfiguration>();
  public readonly symbolResolver: SymbolResolverI;

  constructor(
      public readonly baseConfigurationName: string,
      public readonly workspaceFolder: vscode.WorkspaceFolder) {
    this.symbolResolver = new WorkspaceSymbolResolver(this.workspaceFolder);

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
