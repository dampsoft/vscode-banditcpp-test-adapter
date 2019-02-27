import {SpawnSyncOptions} from 'child_process';

import {TestSuiteConfiguration} from '../configuration/configuration';
import {resolveSymbols, SymbolResolverI} from '../configuration/symbol';
import {SpawnArguments, SpawnResult} from '../execution/spawner';
import {ParseResult, TestSpawnerBase} from '../execution/testspawner';
import {asTest, asTestGroup, TestGroup, TestNodeI} from '../project/test';
import {TestStatus, TestStatusFailed, TestStatusIdle, TestStatusPassed, TestStatusSkipped} from '../project/teststatus';
import {escapeRegExp, removeDuplicates} from '../util/helper';
import {Logger} from '../util/logger';
import {Message} from '../util/message';
import {Version} from '../util/version';

const uuid = require('uuid/v4');


/**
 * Spezieller Wrapper der Spawner-Klasse für Aufrufe an das Bandit-Framework.
 */
export class BanditSpawner extends TestSpawnerBase {
  constructor(config: TestSuiteConfiguration) {
    super(config, /bandit version (\d+\.\d+\.\d+)/i, new Version(3, 0, 0));
  }

  /**
   * Erzeugt die Optionen für den Aufruf der Test-Executable
   */
  protected createSpawnOptions(): SpawnSyncOptions {
    return {
      cwd: this.config.cwd,
      env: this.config.env,
      shell: true,
      windowsVerbatimArguments: true,
      encoding: 'utf8',
      windowsHide: true
    };
  }

  /**
   * Erzeugt die Basis-Parameter für den Aufruf der Test-Executable
   */
  protected createDefaultExecutionArguments(): string[] {
    let execArguments = new Array<string>();
    execArguments.push('--reporter=spec');
    if (this.version.greaterOrEqual(new Version(3, 0, 0))) {
      execArguments.push('--colorizer=off');
    } else {
      execArguments.push('--no-color');
    }
    return execArguments;
  }

  /**
   * Erzeugt die speziellen Parameter zum Ermitteln der Bandit-Version
   */
  protected createSpawnArgumentsVersion(): SpawnArguments {
    return {
      id: this.config.name,
      cmd: this.config.cmd,
      args: ['--version'],
      options: this.createSpawnOptions()
    };
  }

  /**
   * Erzeugt die speziellen Parameter für den Probelauf
   */
  protected createSpawnArgumentsDryRun(runtimeResolvers?: SymbolResolverI[]):
      SpawnArguments {
    let execArguments = this.createDefaultExecutionArguments();
    execArguments.push('--dry-run');
    execArguments.push(
        `"--only=${uuid()}${uuid()}${uuid()}"`);  // Ein extrem seltener String
    if (this.config.options) {
      execArguments.push(...this.config.options);
    }
    let execOptions = this.createSpawnOptions();
    return {
      id: `${this.config.name}-dry-run`,
      cmd: resolveSymbols(this.config.cmd, runtimeResolvers || []),
      args: resolveSymbols(execArguments, runtimeResolvers || []),
      options: resolveSymbols(execOptions, runtimeResolvers || [])
    };
  }

  /**
   * Erzeugt die speziellen Parameter für Testlauf eines Testknotens
   */
  protected createSpawnArgumentsTestRun(
      node: TestNodeI, runtimeResolvers?: SymbolResolverI[]): SpawnArguments {
    let execArguments = this.createDefaultExecutionArguments();
    // Finde den längstmöglichen Teilstring zwischen Unicode-Zeichen und
    // verwende ihn als Testlauf-Filter:
    let label_matches = node.label.match(/[^\u00A1-\uFFFF]+/gi);
    if (label_matches) {
      var label_filter = label_matches.reduce((a, b) => {
        return a.length > b.length ? a : b;
      });
      if (label_filter.length > 0) {
        execArguments.push(`"--only=${label_filter}"`);
      }
    }
    if (this.config.options) {
      execArguments.push(...this.config.options);
    }
    let execOptions = this.createSpawnOptions();
    return {
      id: node.id,
      cmd: resolveSymbols(this.config.cmd, runtimeResolvers || []),
      args: resolveSymbols(execArguments, runtimeResolvers || []),
      options: resolveSymbols(execOptions, runtimeResolvers || [])
    };
  }

  /**
   * Parsed das Ergebnis der Testausgabe
   * @param  spawnResult  Ergebnis der Testausführung
   * @returns             Gibt das Wandlungsergebnis mit der erkannten
   *                      Teststruktur und den Meldungen zurück
   */
  protected parseSpawnResult(spawnResult: SpawnResult): ParseResult {
    let root = new TestGroup(undefined, this.config.name);
    let result = new ParseResult(root);
    let messages = Array<String>();
    let isGroup = (line: string): boolean => {
      return line.trim().startsWith('describe');
    };
    let isTest = (line: string): boolean => {
      return line.trim().startsWith('- it ');
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
      return line.trim().replace(/describe(.*)/i, '$1').trim();
    };
    let parseTestLabel = (line: string): string => {
      return line.trim().replace(/- it (.*)\.\.\..*/i, '$1').trim();
    };
    let parseStatus = (line: string): TestStatus|undefined => {
      var matches =
          line.match(/(.*) \.\.\. (error|failure|failed|ok|skipped)/i);
      if (matches && matches.length >= 2) {
        var status = matches[2].toLowerCase();
        if (status == 'ok') {
          return TestStatusPassed;
        } else if (status == 'skipped') {
          return TestStatusSkipped;
        } else if (
            status == 'error' || status == 'failure' || status == 'failed') {
          return TestStatusFailed;
        }
      }
      return messages.length > 0 ? TestStatusFailed : TestStatusIdle;
    };
    let clearMessages = () => {
      messages = [];
    };
    let getMessage = (): string => {
      return messages.join('\n');
    };
    let error_nodes = new Array<TestNodeI>();
    let finishNode =
        (node: TestNodeI|undefined, status: TestStatus|undefined) => {
          if (status && node) {
            node.message = getMessage();
            Logger.instance.debug(
                `Status "${status}" für Test "${node.id}" erkannt`);
            let nodes = node.finish(status);
            if (status == TestStatusFailed) {
              error_nodes = error_nodes.concat(nodes);
            }
          }
        };
    let current_suite = root;
    let node: TestNodeI|undefined;
    let last_indentation = 0;
    let stdout = spawnResult.stdout.replace(/\r\n/g, '\n');
    let lines = stdout.split(/[\n]+/);
    for (let line of lines) {
      if (line.length) {
        let indentation = line.search(/\S/);
        let lineIsTest = isTest(line);
        let lineIsGroup = isGroup(line);
        if (lineIsGroup || lineIsTest) {
          // Einrückung berücksichtigen:
          let indentation_diff = last_indentation - indentation;
          while (indentation_diff > 0) {
            if (current_suite.parent) {
              current_suite = current_suite.parent;
            } else {
              let msg =
                  `Fehlender Parent bei node mit der id "${current_suite.id}"`;
              Logger.instance.error(msg);
              throw new Error(msg);
            }
            indentation_diff -= 1;
          }
          // Node hinzufügen:
          if (lineIsGroup) {
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
              Logger.instance.debug(`Neue Gruppe erkannt: "${node.id}"`);
            } else {
              let msg = `Eine Gruppe mit dem Label "${
                  newLabel}" existiert bereits in der Gruppe "${
                  current_suite.id}"`;
              Logger.instance.warn(msg);
              result.messages.push(Message.warn('Mehrdeutige Testgruppe', msg));
              node = current_suite = existingGroup;
            }
          } else if (lineIsTest) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseTestLabel(line);
            let invalidLabel = newLabel.trim().length == 0;
            if (invalidLabel) {
              let msg = `Ein Test fehlerhaftem leeren Namen wurde in Gruppe "${
                  current_suite.id}" gefunden. Test wird ignoriert.`;
              Logger.instance.warn(msg);
              result.messages.push(Message.warn('Ungültiger Test', msg));
            } else {
              let existingTest = asTest(current_suite.findByLabel(newLabel));
              if (!existingTest) {
                node = current_suite.addTest(newLabel);
                Logger.instance.debug(`Neuen Test erkannt: "${node.id}"`);
              } else {
                let msg = `Ein Test mit dem Label "${
                    newLabel}" existiert bereits in der Gruppe "${
                    current_suite.id}"`;
                Logger.instance.warn(msg);
                result.messages.push(Message.warn('Mehrdeutiger Test', msg));
                node = existingTest;
              }
            }
          }
        } else {
          messages.push(line);
        }
        // Ergebnis verarbeiten:
        if (node && !lineIsGroup) {
          let status = parseStatus(line);
          finishNode(node, status);
        }
        last_indentation = indentation;
        node = undefined;
      }
    }
    // Nachfolgende Fehlermeldungen verarbeiten:
    let block = getFailureBlock(stdout);
    if (block) {
      let nodes: TestNodeI[] = removeDuplicates(error_nodes, 'id');
      let blocks = block.trim().split(/\n{3,}/g);
      for (let error of blocks) {
        let lines = error.split(/[\n]+/);
        if (lines.length > 1) {
          for (let node of nodes) {
            let labels = [node.label];
            node.parents.forEach(parent => {
              if (parent.parent) {
                labels.push(escapeRegExp(parent.label));
              }
            });
            let requiredLineStart = `^${labels.reverse().join('[ ]+')}:.*`;
            if (lines[0].match(requiredLineStart)) {
              node.message = `${node.displayTitle}:\n\n${
                  lines.slice(1, lines.length).join('\n').replace(/\n$/, '')}`;
              Logger.instance.info(`Fehlermeldung für Test "${
                  node.id}" erkannt:\n${node.message}\n`);
            }
          }
        }
      }
    }
    return result;
  }
}
