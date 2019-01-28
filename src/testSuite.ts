import {performance} from 'perf_hooks';
import {TestInfo, TestSuiteInfo} from 'vscode-test-adapter-api';
import {TestEvent, TestRunFinishedEvent, TestRunStartedEvent, TestSuiteEvent} from 'vscode-test-adapter-api';

import {BanditSpawner} from './bandit';
import {BanditTestSuiteConfigurationI} from './configuration';
import {DisposableI} from './disposable'
import {escapeRegExp, formatTimeDuration, Logger, removeDuplicates} from './helper';
import {SpawnReturnsI} from './spawner'
import {asTest, asTestGroup, BanditTest, BanditTestGroup, BanditTestNode} from './test'
import * as teststatus from './teststatus'
import {DisposableWatcher} from './watch';

export type NotifyTestsuiteChangeHandler = () => void;
export type NotifyStatusHandler = (e: TestSuiteEvent|TestEvent) => void;
export type NotifyStartHandler = (e: TestRunStartedEvent) => void;
export type NotifyFinishHandler = (e: TestRunFinishedEvent) => void;

/**
 * Interface für Testsuites
 */
export interface TestSuiteI extends DisposableI {
  reload(): Promise<TestSuiteInfo|TestInfo>;
  start(ids: (string|RegExp)[]): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * Implementierung der Testsuite für Bandit
 */
export class BanditTestSuite implements TestSuiteI {
  private watch: DisposableI|undefined;
  private changeTimeout: NodeJS.Timer|undefined;
  private testsuite = new BanditTestGroup(undefined, this.name);
  private spawner = new BanditSpawner(this.configuration, this.log);

  constructor(
      private readonly configuration: BanditTestSuiteConfigurationI,  //
      private readonly onSuiteChange: NotifyTestsuiteChangeHandler,   //
      private readonly onStatusChange: NotifyStatusHandler,           //
      private readonly onStart: NotifyStartHandler,                   //
      private readonly onFinish: NotifyFinishHandler,                 //
      private readonly timeout: number,                               //
      private readonly log: Logger) {}

  public dispose() {
    if (this.watch) {
      this.watch.dispose();
      this.watch = undefined;
    }
  }

  public reload(): Promise<TestSuiteInfo|TestInfo> {
    return new Promise((resolve, reject) => {
      this.log.debug('Starte das Laden der Tests');
      let startTime = performance.now();
      this.spawner.dry()
          .then((ret: SpawnReturnsI) => {
            this.log.debug('Erzeuge die Test-Suite');
            this.testsuite = this.createFromString(ret.stdout);
            const duration = performance.now() - startTime;
            this.log.debug(
                `Ladend der Tests erfolgreich beendet. Benötigte Zeit: ${
                                                                         formatTimeDuration(
                                                                             duration)
                                                                       }`);
            this.resetWatch();
            resolve(this.testsuite.getTestInfo());
          })
          .catch((e) => {
            this.log.error('Fehler beim Laden der Tests');
            this.notifyFinished();
            reject(e);
          });
    });
  }

  public start(ids: (string|RegExp)[]): Promise<void> {
    this.log.debug('Starte einen neuen Testlauf');
    return new Promise((resolve, reject) => {
      let nodes = new Array<BanditTestNode>();
      let unique_ids = new Set<(string | RegExp)>(ids);
      for (let id of unique_ids) {
        let r = (typeof id === 'string') ? new RegExp(escapeRegExp(id)) : id;
        nodes = nodes.concat(this.testsuite.findAll(r));
      }
      let started_nodes = new Array<BanditTestNode>();
      for (var node of nodes) {
        started_nodes = started_nodes.concat(node.start());
      }
      started_nodes = removeDuplicates(started_nodes, 'id');
      this.log.debug(`${nodes.length} Tests werden gestartet`);
      this.notifyStart(nodes);
      let promises = new Array<Promise<void>>();
      let startTime = performance.now();
      for (let node of started_nodes) {
        if (asTest(node)) {
          promises.push(this.createTestRunSpawn(node));
        }
      }
      Promise.all(promises)
          .then(() => {
            let duration = performance.now() - startTime;
            this.log.debug(
                `Testlauf erfolgreich beendet. Benötigte Zeit: ${
                                                                 formatTimeDuration(
                                                                     duration)
                                                               }`);
            resolve();
          })
          .catch((e) => {
            reject(e);
            this.notifyFinished();
          });
    });
  }

  public cancel(): Promise<void> {
    return new Promise(() => {
      this.log.info('Breche alle laufenden Tests ab');
      this.testsuite.stop().map(this.notifyStatus, this);
      this.spawner.stop();
    });
  }

  private get name() {
    return this.configuration.name;
  }

  private createTestRunSpawn(node: BanditTestNode): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.spawner.run(node)
          .then((ret: SpawnReturnsI) => {
            if (ret.cancelled) {
              node.stop().map(this.notifyStatus, this);
            } else {
              this.updateFromString(node, ret.stdout);
            }
            resolve();
          })
          .catch((e) => {
            this.finish(node, teststatus.Failed);
            this.log.error(`Fehler beim Ausführen des Tests "${node.id}"`);
            reject(e);
          });
    });
  }

  private createFromString(stdout: string): BanditTestGroup {
    let root = new BanditTestGroup(undefined, this.name);
    let messages = Array<String>();
    let isGroup = (line: string): boolean => {
      return line.trim().startsWith('describe');
    };
    let isTest = (line: string): boolean => {
      return line.trim().startsWith('- it ')
    };
    let getFailureBlock = (text: string): string|undefined => {
      const start = '\nThere were failures!';
      const end = '\nTest run complete.';
      let blockStartIdx = text.indexOf(start);
      if (blockStartIdx >= 0) {
        blockStartIdx += start.length;
        let blockEndIdx = text.indexOf(end, blockStartIdx);
        if (blockEndIdx > blockStartIdx) {
          return text.substring(blockStartIdx, blockEndIdx);
        }
      }
      return undefined;
    };
    let parseGroupLabel = (line: string): string => {
      return line.trim().replace(/describe(.*)/i, '\$1').trim();
    };
    let parseTestLabel = (line: string): string => {
      return line.trim().replace(/- it (.*)\.\.\..*/i, '\$1').trim();
    };
    let parseStatus = (line: string): teststatus.TestStatus|undefined => {
      var matches =
          line.match(/(.*) \.\.\. (error|failure|failed|ok|skipped)/i);
      if (matches && matches.length >= 2) {
        var status = matches[2].toLowerCase();
        if (status == 'ok') {
          return teststatus.Passed;
        } else if (status == 'skipped') {
          return teststatus.Skipped;
        } else if (
            status == 'error' || status == 'failure' || status == 'failed') {
          return teststatus.Failed;
        }
      }
      return messages.length > 0 ? teststatus.Failed : teststatus.Idle;
    };
    let clearMessages = () => {
      messages = [];
    };
    let getMessage = (): string => {
      return messages.join('\n');
    };
    let error_nodes = new Array<BanditTestNode>();
    let finishNode =
        (node: BanditTestNode|undefined,
         status: teststatus.TestStatus|undefined) => {
          if (status && node) {
            node.message = getMessage();
            this.log.debug(`Status "${status}" für Test "${node.id}" erkannt`);
            let nodes = node.finish(status);
            if (status == teststatus.Failed) {
              error_nodes = error_nodes.concat(nodes);
            }
          }
        };
    let current_suite = root;
    let node: BanditTestNode|undefined;
    let last_indentation = 0;
    let status: teststatus.TestStatus|undefined;
    stdout = stdout.replace(/\r\n/g, '\n');
    let lines = stdout.split(/[\n]+/);
    for (let line of lines) {
      if (line.length) {
        let indentation = line.search(/\S/);
        if (isGroup(line) || isTest(line)) {
          // Einrückung berücksichtigen:
          let indentation_diff = last_indentation - indentation;
          while (indentation_diff > 0) {
            if (current_suite.parent) {
              current_suite = current_suite.parent;
            } else {
              let msg =
                  `Fehlender Parent bei node mit der id "${current_suite.id}"`;
              this.log.error(msg);
              throw new Error(msg);
            }
            indentation_diff -= 1;
          }
          // Node hinzufügen:
          if (isGroup(line)) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseGroupLabel(line);
            // Node already exists?
            let existingGroup =
                asTestGroup(current_suite.findByLabel(newLabel));
            if (!existingGroup) {
              node = current_suite = current_suite.addSuite(newLabel);
              this.log.debug('Neue Gruppe erkannt: "' + node.id + '"');
            } else {
              this.log.error(
                  `Eine Gruppe mit dem Label "${
                                                newLabel
                                              }" exisitiert bereits in der Gruppe "${
                                                                                     current_suite
                                                                                         .id
                                                                                   }"`);
              node = current_suite = existingGroup;
            }
          } else if (isTest(line)) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseTestLabel(line);
            // Node already exists?
            let existingTest = asTest(current_suite.findByLabel(newLabel));
            if (!existingTest) {
              node = current_suite.addTest(newLabel);
              this.log.debug('Neuen Test erkannt: "' + node.id + '"');
            } else {
              this.log.error(
                  'Ein Test mit dem Label "' + newLabel +
                  '" exisitiert bereits in der Gruppe "' + current_suite.id +
                  '"');
              node = existingTest;
            }
          }
        } else {
          messages.push(line);
        }
        // Ergebnis verarbeiten:
        status = parseStatus(line);
        finishNode(node, status);
        last_indentation = indentation;
        node = undefined;
      }
    }
    // Nachfolgende Fehlermeldungen verarbeiten:
    let block = getFailureBlock(stdout);
    if (block) {
      let nodes = removeDuplicates(error_nodes, 'id');
      let blocks = block.trim().split(/\n{3,}/g);
      for (let error of blocks) {
        let lines = error.split(/[\n]+/);
        if (lines.length > 1) {
          for (let node of nodes) {
            if (lines[0].startsWith(node.displayTitle.trim() + ':')) {
              node.message =
                  lines.slice(1, lines.length).join('\n').replace(/\n$/, '');
              this.log.debug(
                  'Fehlermeldung für Test "' + node.id + '" erkannt:\n' +
                  node.message);
            }
          }
        }
      }
    }
    return root;
  }

  private updateFromString(node: BanditTestNode, stdout: string) {
    let parsed_result = this.createFromString(stdout);
    let result_node = parsed_result.find(node.id);
    if (result_node) {
      this.log.debug(
          'Status "' + result_node.status + '" für Test "' + node.id +
          '" erkannt');
      node.finish(result_node.status, result_node.message)
          .map(this.notifyStatus, this);
    } else {
      this.log.warn(
          'In der Testausgabe konnte der Test "' + node.id +
          '" nicht gefunden werden');
      node.finish(teststatus.Skipped).map(this.notifyStatus, this);
    }
  }

  private finish(
      node: BanditTestNode, status: teststatus.TestStatus, message?: string) {
    node.finish(status, message).map(this.notifyStatus, this);
  }

  private notifyStatus(node: BanditTestNode) {
    let e = this.getStatusEvent(node);
    if (e) {
      this.onStatusChange(e);
      if (this.testsuite.status != teststatus.Running) {
        this.notifyFinished();
      }
    }
  }

  private notifyStart(nodes: BanditTestNode[]) {
    let ids = new Array<string>();
    for (let node of nodes) {
      ids.push(node.id);
      let group = asTestGroup(node);
      if (group) {
        let tests = group.tests;
        for (let test of tests) {
          ids.push(test.id);
        }
      }
    }
    this.onStart(<TestRunStartedEvent>{type: 'started', tests: ids});
  }

  private notifyFinished() {
    this.onFinish(<TestRunFinishedEvent>{type: 'finished'});
  }

  private getStatusEvent(node: BanditTestNode): TestEvent|TestSuiteEvent
      |undefined {
    let test = asTest(node);
    let group = asTestGroup(node);
    if (test) {
      return this.getTestStatusEvent(test);
    } else if (group) {
      return this.getGroupStatusEvent(group);
    }
    return undefined;
  }

  private getTestStatusEvent(test: BanditTest): TestEvent {
    let status;
    if (test.status == teststatus.Running) {
      status = 'running';
    } else if (test.status == teststatus.Passed) {
      status = 'passed';
    } else if (test.status == teststatus.Failed) {
      status = 'failed';
    } else {
      status = 'skipped';
    }
    return {
      type: 'test',
      test: test.id,
      state: status,
      message: test.message
    } as TestEvent;
  }

  private getGroupStatusEvent(group: BanditTestGroup): TestSuiteEvent {
    let status;
    if (group.status == teststatus.Running) {
      status = 'running';
    } else {
      status = 'completed';
    }
    return {
      type: 'suite',
      suite: group.id,
      state: status,
      message: group.message
    } as TestSuiteEvent;
  }

  /**
   * Erzeugt Datei-Watches.
   * Bei Änderungen an den beobachteten Test-Dateien wird `onSuiteChange()`
   * getriggert.
   */
  private resetWatch() {
    if (this.watch) {
      this.watch.dispose();
    }
    let paths: string[] = [];
    paths.push(this.configuration.cmd);
    if (this.configuration.watches) {
      paths.concat(this.configuration.watches);
    }
    const onReady = () => {
      this.log.info(
          `Beobachte Änderung an der Testumgebung ${
                                                    this.configuration.name
                                                  }...`);
    };
    const onChange = () => {
      this.log.info(
          `Änderung an der Testumgebung ${
                                          this.configuration.name
                                        } erkannt. Führe Autorun aus.`);
      if (this.changeTimeout) {
        clearTimeout(this.changeTimeout);
        this.changeTimeout = undefined;
      }
      this.changeTimeout = setTimeout(() => {
        this.onSuiteChange();
      }, this.timeout);
    };
    const onError = () => {
      this.log.error(
          `Beim Beobachten der Testumgebung ${
                                              this.configuration.name
                                            } ist ein Fehler aufgetreten.`);
    };
    this.watch = new DisposableWatcher(paths, onReady, onChange, onError);
  }
}