import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';

import {DisposableI} from '../util/disposable';
import {switchOs} from '../util/helper';
import {LogLevel} from '../util/logger';
import {CanNotifyMessages, Message, NotifyMessageHandler} from '../util/message';
import {DisposableWatcher} from '../util/watch';

import {EnvProperty, mergeEnv} from './environment';
import {Messages} from './messages';
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

export type TestFramework = 'bandit'

export class TestSuiteConfiguration {
  private isValid: boolean = true;

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

  public get framework(): TestFramework {
    return 'bandit';
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

  public get valid(): boolean {
    return this.isValid;
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
    cmd = cmd || this.jsonConfig.cmd;
    if (cmd) {
      this.jsonConfig.cmd =
          this.parentConfig.resolvePath(cmd, this.jsonConfig.cwd);
    } else {
      this.isValid = false;
    }
  }

  private resolveEnv() {
    let env = switchOs<EnvProperty>(this.jsonConfig, 'env');
    env = env || this.jsonConfig.env;
    if (env) {
      env = this.parentConfig.resolveEnv(env);
    }
    return env;
  }

  private resolveWatches() {
    let watches = switchOs<string[]>(this.jsonConfig, 'watches');
    watches = watches || this.jsonConfig.watches;
    if (watches) {
      this.jsonConfig.watches = watches.map(
          w => this.parentConfig.resolvePath(w, this.jsonConfig.cwd));
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

export type NotifyConfigChangeHandler = (hardReset: boolean) => void;

export class Configuration extends CanNotifyMessages implements DisposableI {
  private propertyGetter = new Map<string, () => any>();
  private testSuiteConfigs = new Array<TestSuiteConfiguration>();
  public readonly symbolResolver: SymbolResolverI;
  private coreConfigWatch: DisposableI|undefined;
  private testsuiteConfigWatch: DisposableI|undefined;

  constructor(
      public readonly baseConfigurationName: string,
      public readonly workspaceFolder: vscode.WorkspaceFolder,
      private onConfigChangedHandler: NotifyConfigChangeHandler,
      notificationHandler?: NotifyMessageHandler) {
    super(notificationHandler);

    this.createCoreWatch();

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

  public dispose() {
    if (this.testsuiteConfigWatch) {
      this.testsuiteConfigWatch.dispose();
      this.testsuiteConfigWatch = undefined;
    }
    if (this.coreConfigWatch) {
      this.coreConfigWatch.dispose();
      this.coreConfigWatch = undefined;
    }
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
    let jsonConfigPath: string|undefined;
    if (typeof conf === 'string') {
      try {
        jsonConfigPath = this.resolvePath(conf);
        jsonConfig = fs.readJsonSync(jsonConfigPath);
      } catch (e) {
      }
    } else {
      jsonConfig = conf as TestSuiteJsonConfigurationI[];
    }
    this.resetTestsuiteConfigWatch(jsonConfigPath);
    this.testSuiteConfigs = [];
    let configNames = new Set<string>();
    for (let config of jsonConfig) {
      let tsConfig = new TestSuiteConfiguration(this, config);
      if (configNames.has(tsConfig.name)) {
        this.notify(Messages.getTestsuiteIdAmbiguous(tsConfig.name));
      } else if (!tsConfig.valid) {
        this.notify(Messages.getTestsuiteConfigInvalid(tsConfig.name));
      } else {
        configNames.add(tsConfig.name);
        this.testSuiteConfigs.push(tsConfig);
      }
    }
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

  /**
   * Erzeugt einen Konfigurations-Watch
   */
  private createCoreWatch() {
    if (this.coreConfigWatch) {
      this.coreConfigWatch.dispose();
      this.coreConfigWatch = undefined;
    }
    this.coreConfigWatch =
        vscode.workspace.onDidChangeConfiguration(configChange => {
          let affects = (property: Property): boolean => {
            return configChange.affectsConfiguration(
                this.config.fullname(property), this.workspaceFolder.uri);
          };
          this.onConfigChangedHandler(this.propertiesHardReset.some(affects));
        });
  }

  /**
   * Erzeugt einen Datei-Watch für die JSON-Testsuite-Konfiguration wenn ein
   * solcher Pfad als Testsuite angegeben wurde. Bei Änderungen an den
   * beobachteten Test-Dateien wird `onSuiteChange()` getriggert.
   */
  private resetTestsuiteConfigWatch(jsonConfigPath: string|undefined) {
    if (this.testsuiteConfigWatch) {
      this.testsuiteConfigWatch.dispose();
      this.testsuiteConfigWatch = undefined;
    }
    if (jsonConfigPath) {
      let paths: string[] = [];
      paths.push(jsonConfigPath);
      const onReady = () => {
        Message.log(
            Messages.getTestsuiteConfigurationWatchReady(jsonConfigPath));
      };
      const onChange = (path: string, stats: any) => {
        Message.log(
            Messages.getTestsuiteConfigurationWatchTrigger(jsonConfigPath));
        this.onConfigChangedHandler(
            true);  // TODO? Check if hard reset necessary
      };
      const onError = () => {
        Message.log(
            Messages.getTestsuiteConfigurationWatchError(jsonConfigPath));
      };
      this.testsuiteConfigWatch =
          new DisposableWatcher(paths, onReady, onChange, onError);
    }
  }
}
