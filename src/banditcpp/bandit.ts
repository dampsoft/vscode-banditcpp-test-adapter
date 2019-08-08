import {SpawnSyncOptions} from 'child_process';

import {TestSuiteConfiguration} from '../configuration/configuration';
import {resolveSymbols, SymbolResolverI} from '../configuration/symbol';
import {SpawnArguments, SpawnResult} from '../execution/spawner';
import {ParseResult, TestSpawnerBase} from '../execution/testspawner';
import {asTest, asTestGroup, TestGroup, TestNodeI} from '../project/test';
import {TestStatus, TestStatusFailed, TestStatusPassed, TestStatusSkipped} from '../project/teststatus';
import {escapeRegExp, removeDuplicates} from '../util/helper';
import {Logger} from '../util/logger';
import {Version} from '../util/version';

import {Messages} from './messages';


const uuid = require('uuid/v4');


/**
 * Spezieller Wrapper der Spawner-Klasse für Aufrufe an das Bandit-Framework.
 */
export class BanditSpawner extends TestSpawnerBase {
  constructor(config: TestSuiteConfiguration) {
    super(config, /bandit version (\d+\.\d+\.\d+)/i, new Version(0, 0, 0));
  }

  /**
   * Erzeugt die Optionen für den Aufruf der Test-Executable
   */
  protected createSpawnOptions(): SpawnSyncOptions {
    return {
      cwd: this.config.cwd,
      env: this.config.env,
      shell: true,
      encoding: 'utf8'
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
      id: uuid(),
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
    execArguments.push(`"--only=${uuid()}"`);  // Ein extrem seltener String
    if (this.config.options) {
      execArguments.push(...this.config.options);
    }
    let execOptions = this.createSpawnOptions();
    return {
      id: uuid(),
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
    let label_matches = node.label.match(/[^\u00A1-\uFFFF\"]+/gi);
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
      id: uuid(),
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
          line.match(/(?<=\s|^)(ERROR|FAILURE|FAILED|OK|SKIPPED)(?=\s|$)/);
      if (matches && matches.length >= 1) {
        var status = matches[1].toLowerCase();
        if (status == 'ok') {
          return TestStatusPassed;
        } else if (status == 'skipped') {
          return TestStatusSkipped;
        } else if (
            status == 'error' || status == 'failure' || status == 'failed') {
          return TestStatusFailed;
        }
      }
      return undefined;
    };
    let parseMessage = (line: string): string => {
      let message = line.replace(
          / *(\.\.\.)? *(ERROR|FAILURE|FAILED|OK|SKIPPED)(?=\s|$)/g, '');
      message = message.replace(/(?<=\s|^)[ \t]*((- it)|describe) .*/g, '');
      return message;
    };
    let clearMessages = () => {
      messages = [];
    };
    let getMessage = (): string => {
      return messages.filter(l => l != '').join('\n');
    };
    let error_nodes = new Array<TestNodeI>();
    let finishNode =
        (node: TestNodeI|undefined, status: TestStatus|undefined) => {
          if (status && node) {
            let nodes = node.finish(status, getMessage());
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
              const msg =
                  '\n' + Messages.getMissingNodeParent(current_suite.id);
              Logger.instance.error(msg);
              throw new Error(msg);
            }
            indentation_diff -= 1;
          }
          // Node hinzufügen:
          if (lineIsGroup) {
            if (node) {
              // Alte Messages dem letzten Knoten zuweisen, bevor weitergemacht
              // wird.
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseGroupLabel(line);
            // Node already exists?
            let existingGroup =
                asTestGroup(current_suite.findByLabel(newLabel));
            if (!existingGroup) {
              node = current_suite = current_suite.addSuite(newLabel);
              result.messages.push(Messages.getInfoNewGroup(node.id));
            } else {
              result.messages.push(
                  Messages.getAmbiguousGroup(newLabel, current_suite.id));
              node = current_suite = existingGroup;
            }
          } else if (lineIsTest) {
            if (node) {
              // Alte Messages dem letzten Knoten zuweisen, bevor weitergemacht
              // wird.
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseTestLabel(line);
            let invalidLabel = newLabel.trim().length == 0;
            if (invalidLabel) {
              result.messages.push(
                  Messages.getEmptyNodeLabel(current_suite.id));
            } else {
              let existingTest = asTest(current_suite.findByLabel(newLabel));
              if (!existingTest) {
                node = current_suite.addTest(newLabel);
                result.messages.push(Messages.getInfoNewTest(node.id));
              } else {
                result.messages.push(
                    Messages.getAmbiguousTest(newLabel, current_suite.id));
                node = undefined;
              }
            }
          }
        } else {
          messages.push(parseMessage(line));
        }

        // Ergebnis verarbeiten:
        if (node && !lineIsGroup) {
          let status = parseStatus(line);
          if (status) {
            finishNode(node, status);
            node = undefined;
          }
        }
        if (lineIsGroup || lineIsTest) {
          last_indentation = indentation;
        }
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
                labels.push(parent.label);
              }
            });
            labels = labels.map(escapeRegExp).reverse();
            let requiredLineStart = `^${labels.join('[ ]+')}:.*`;
            if (lines[0].match(requiredLineStart)) {
              let title = `${node.displayTitle.trim()}:`;
              let internal_error = node.message || '';
              let bandit_error = lines.slice(1, lines.length)
                                     .filter(l => l != '')
                                     .join('\n')
                                     .replace(/\n$/, '');
              node.message = [title, internal_error, bandit_error]
                                 .filter(m => m != '')
                                 .join('\n\n');
              result.messages.push(
                  Messages.getInfoErrorsDetected(node.id, node.message));
            }
          }
        }
      }
    }
    return result;
  }
}
