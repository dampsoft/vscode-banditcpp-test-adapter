import { SpawnSyncOptions } from "child_process";

import { BanditTestSuiteConfiguration } from "./configuration";
import { escapeRegExp, removeDuplicates } from "./helper";
import { Logger } from "./logger";
import { Message } from "./message";
import { SpawnArguments, Spawner, SpawnReturnsI } from "./spawner";
import { asTest, asTestGroup, BanditTestGroup, BanditTestNode } from "./test";
import * as teststatus from "./teststatus";
import { Version } from "./version";

export interface ParseResultI {
  testsuite: BanditTestGroup;
  messages: Message[];
}

/**
 * Spezieller Wrapper der Spawner-Klasse für Aufrufe an das Bandit-Framework.
 */
export class BanditSpawner {
  private readonly banditVersionFallback = new Version(3, 0, 0);
  private banditVersionDetected: Version | undefined;

  constructor(private readonly config: BanditTestSuiteConfiguration) {}

  /**
   * Ermittelt die Banditversion anhand eines Aufrufs der Testexecutable mit
   * --version.
   * Wenn keine Version ermittelt werden konnte, wird die aktuellste angenommen. @see banditVersionFallback
   */
  private getBanditVersion(): Promise<Version> {
    return new Promise(resolve => {
      if (!this.banditVersionDetected) {
        this.createSpawnArgumentsVersion().then(spawn_args => {
          Logger.instance.debug(
            "Ermittle die aktuelle Version des Testframeworks..."
          );
          Spawner.instance
            .spawn(spawn_args)
            .then((ret: SpawnReturnsI) => {
              let matches = ret.stdout.match(/bandit version (\d+\.\d+\.\d+)/i);
              if (matches && matches.length == 2) {
                return Version.fromString(matches[1]);
              } else {
                return Version.fromString(ret.stdout);
              }
            })
            .then(v => {
              let banditVersion = v ? v : this.banditVersionFallback;
              this.banditVersionDetected = banditVersion;
              if (v) {
                Logger.instance.debug(
                  `Die Version des Testframeworks für ${
                    this.config.name
                  } wurde erfolgreich erkannt: ${banditVersion}`
                );
              } else {
                Logger.instance.warn(
                  `Die Version des Testframeworks für ${
                    this.config.name
                  } konnte nicht erkannt werden. Verwende aktuellste: ${banditVersion}`
                );
              }
              resolve(banditVersion);
            });
        });
      } else {
        resolve(this.banditVersionDetected);
      }
    });
  }

  /**
   * Führt den Test für einen Testknoten aus.
   * @param  node  Knoten für den der Test ausgeführt werden soll
   * @returns      Gibt ein Promise mit allen betroffenen Testknoten nach der
   *               Ausführung zurück.
   */
  public run(node: BanditTestNode): Promise<BanditTestNode[]> {
    return new Promise(resolve => {
      this.createSpawnArgumentsTestRun(node).then(spawn_args => {
        Spawner.instance
          .spawn(spawn_args)
          .then((ret: SpawnReturnsI) => {
            if (!ret.cancelled && ret.status < 0) {
              let msg = `Fehlerhafter Return-Value beim run() Aufruf der Test-Executable ${
                node.id
              }`;
              Logger.instance.error(msg);
              resolve(node.finish(teststatus.Failed, msg));
            } else {
              Logger.instance.debug(
                `Test-Executable ${node.id} erfolgreich aufgerufen`
              );
              resolve(this.updateNodeFromString(node, ret));
            }
          })
          .catch(e => {
            let msg = `Fehler beim run() Aufruf der Test-Executable ${node.id}`;
            Logger.instance.error(msg);
            resolve(node.finish(teststatus.Failed, msg));
          });
      });
    });
  }

  /**
   * Startet einen Probelauf ohne tatsächliche Testausführung. Auf Basis der
   * Ausgabe werden alle vorhandenen Tests und deren hierarchischer Zusammenhang
   * ermittelt.
   * @returns  Gibt ein Promise mit dem Ergebnis der Stdout-Analyse zurück.
   */
  public dry(): Promise<ParseResultI> {
    return new Promise((resolve, reject) => {
      this.createSpawnArgumentsDryRun().then(spawn_args => {
        Spawner.instance
          .spawn(spawn_args)
          .then((ret: SpawnReturnsI) => {
            if (ret.status < 0) {
              Logger.instance.error(
                `Fehlerhafter Return-Value beim dry() Aufruf der Test-Executable ${
                  this.config.name
                }`
              );
              reject(ret.error);
            } else {
              Logger.instance.debug(
                `Test-Executable ${this.config.name} erfolgreich aufgerufen`
              );
              resolve(this.parseString(ret.stdout));
            }
          })
          .catch(e => {
            Logger.instance.error(
              `Fehler beim dry() Aufruf der Test-Executable ${this.config.name}`
            );
            reject(e);
          });
      });
    });
  }

  /**
   * Stoppt alle laufenden und alle wartenden Tests. Wenn zudem
   * `allowKillProcess` aktiviert ist, werden laufende Prozesse hart beendet.
   */
  public stop() {
    Logger.instance.info("Beende alle laufenden Prozesse");
    if (this.config.allowKillProcess) {
      Spawner.instance.killAll();
    }
  }

  /**
   * Erzeugt die Optionen für den Aufruf der Testexecutable
   */
  private createSpawnOptions(): SpawnSyncOptions {
    return {
      cwd: this.config.cwd,
      env: this.config.env,
      // shell: true,
      windowsVerbatimArguments: true,
      encoding: "utf8"
    };
  }

  /**
   * Erzeugt die Basis-Parameter für den Aufruf der Testexecutable
   */
  private createDefaultExecutionArguments(): Promise<string[]> {
    return new Promise(resolve => {
      this.getBanditVersion().then(version => {
        let execArguments = new Array<string>();
        execArguments.push("--reporter=spec");
        if (version.greaterOrEqual(new Version(3, 0, 0))) {
          execArguments.push("--colorizer=off");
        } else {
          execArguments.push("--no-color");
        }
        resolve(execArguments);
      });
    });
  }

  /**
   * Erzeugt die speziellen Parameter zum Ermitteln der Bandit-Version
   */
  private createSpawnArgumentsVersion(): Promise<SpawnArguments> {
    return new Promise(resolve => {
      resolve(<SpawnArguments>{
        id: this.config.name,
        cmd: this.config.cmd,
        args: ["--version"],
        options: this.createSpawnOptions()
      });
    });
  }

  /**
   * Erzeugt die speziellen Parameter für den Probelauf
   */
  private createSpawnArgumentsDryRun(): Promise<SpawnArguments> {
    return new Promise(resolve => {
      this.createDefaultExecutionArguments().then(execArguments => {
        execArguments.push("--dry-run");
        execArguments.push(
          `"--only=7a310047-cbb3-4ccb-92c0-ead7d4bb10c3d33b11a0-48fb-4755-9cc4-6fbd9518c344"`
        ); // Ein extrem seltener String
        // `"--only=${uuid()}${uuid()}${uuid()}"`);  // Ein extrem seltener
        // String
        if (this.config.options) {
          execArguments.push(...this.config.options);
        }
        let exec_options = this.createSpawnOptions();
        resolve({
          id: `${this.config.name}-dry-run`,
          cmd: this.config.cmd,
          args: execArguments,
          options: exec_options
        });
      });
    });
  }

  /**
   * Erzeugt die speziellen Parameter für Testlauf eines Testknotens
   */
  private createSpawnArgumentsTestRun(
    node: BanditTestNode
  ): Promise<SpawnArguments> {
    return this.createDefaultExecutionArguments().then(execArguments => {
      // Finde den längstmöglichen Teilstring zwischen Unicode-Zeichen und
      // verwende ihn als Testlauf-Filter:
      let label_matches = node.label.match(/[^\u00A1-\uFFFF]+/gi);
      if (label_matches) {
        var label_filter = label_matches.reduce(function(a, b) {
          return a.length > b.length ? a : b;
        });
        if (label_filter.length > 0) {
          execArguments.push(`"--only=${label_filter}"`);
        }
      }
      if (this.config.options) {
        execArguments.push(...this.config.options);
      }
      let exec_options = this.createSpawnOptions();
      return {
        id: node.id,
        cmd: this.config.cmd,
        args: execArguments,
        options: exec_options
      };
    });
  }

  /**
   * Parsed den Stdout String der Testausgabe
   * @param  stdout  Ausgabestring
   * @returns        Gibt das Wandlungsergebnis mit der erkannten Teststruktur
   *                 und den Meldungen zurück
   */
  private parseString(stdout: string): ParseResultI {
    let root = new BanditTestGroup(undefined, this.config.name);
    let result: ParseResultI = { testsuite: root, messages: [] };
    let messages = Array<String>();
    let isGroup = (line: string): boolean => {
      return line.trim().startsWith("describe");
    };
    let isTest = (line: string): boolean => {
      return line.trim().startsWith("- it ");
    };
    let getFailureBlock = (text: string): string | undefined => {
      const start = "\nThere were failures!";
      const end = "\nTest run complete.";
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
      return line
        .trim()
        .replace(/describe(.*)/i, "$1")
        .trim();
    };
    let parseTestLabel = (line: string): string => {
      return line
        .trim()
        .replace(/- it (.*)\.\.\..*/i, "$1")
        .trim();
    };
    let parseStatus = (line: string): teststatus.TestStatus | undefined => {
      var matches = line.match(
        /(.*) \.\.\. (error|failure|failed|ok|skipped)/i
      );
      if (matches && matches.length >= 2) {
        var status = matches[2].toLowerCase();
        if (status == "ok") {
          return teststatus.Passed;
        } else if (status == "skipped") {
          return teststatus.Skipped;
        } else if (
          status == "error" ||
          status == "failure" ||
          status == "failed"
        ) {
          return teststatus.Failed;
        }
      }
      return messages.length > 0 ? teststatus.Failed : teststatus.Idle;
    };
    let clearMessages = () => {
      messages = [];
    };
    let getMessage = (): string => {
      return messages.join("\n");
    };
    let error_nodes = new Array<BanditTestNode>();
    let finishNode = (
      node: BanditTestNode | undefined,
      status: teststatus.TestStatus | undefined
    ) => {
      if (status && node) {
        node.message = getMessage();
        Logger.instance.debug(
          `Status "${status}" für Test "${node.id}" erkannt`
        );
        let nodes = node.finish(status);
        if (status == teststatus.Failed) {
          error_nodes = error_nodes.concat(nodes);
        }
      }
    };
    let current_suite = root;
    let node: BanditTestNode | undefined;
    let last_indentation = 0;
    let status: teststatus.TestStatus | undefined;
    stdout = stdout.replace(/\r\n/g, "\n");
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
              let msg = `Fehlender Parent bei node mit der id "${
                current_suite.id
              }"`;
              Logger.instance.error(msg);
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
            let existingGroup = asTestGroup(
              current_suite.findByLabel(newLabel)
            );
            if (!existingGroup) {
              node = current_suite = current_suite.addSuite(newLabel);
              Logger.instance.debug(`Neue Gruppe erkannt: "${node.id}"`);
            } else {
              let msg = `Eine Gruppe mit dem Label "${newLabel}" exisitiert bereits in der Gruppe "${
                current_suite.id
              }"`;
              Logger.instance.warn(msg);
              result.messages.push(Message.warn("Mehrdeutige Testgruppe", msg));
              node = current_suite = existingGroup;
            }
          } else if (isTest(line)) {
            if (node) {
              node.message = getMessage();
            }
            clearMessages();
            let newLabel = parseTestLabel(line);
            let invalidLabel = newLabel.trim().length == 0;
            if (invalidLabel) {
              let msg = `Ein Test fehlerhaftem leeren Namen wurde in Gruppe "${
                current_suite.id
              }" gefunden. Test wird ignoriert.`;
              Logger.instance.warn(msg);
              result.messages.push(Message.warn("Ungültiger Test", msg));
            } else {
              let existingTest = asTest(current_suite.findByLabel(newLabel));
              if (!existingTest) {
                node = current_suite.addTest(newLabel);
                Logger.instance.debug(`Neuen Test erkannt: "${node.id}"`);
              } else {
                let msg = `Ein Test mit dem Label "${newLabel}" exisitiert bereits in der Gruppe "${
                  current_suite.id
                }"`;
                Logger.instance.warn(msg);
                result.messages.push(Message.warn("Mehrdeutiger Test", msg));
                node = existingTest;
              }
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
      let nodes: BanditTestNode[] = removeDuplicates(error_nodes, "id");
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
            let requiredLineStart = `^${labels.reverse().join("[ ]+")}:.*`;
            if (lines[0].match(requiredLineStart)) {
              node.message = lines
                .slice(1, lines.length)
                .join("\n")
                .replace(/\n$/, "");
              Logger.instance.debug(
                `Fehlermeldung für Test "${node.id}" erkannt:\n${
                  node.message
                }\n`
              );
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Aktualisiert einen Testknoten auf Basis des Ausgabestrings.
   * Dazu wird der String zunächst als vollständige Testhierarchie geparsed,
   * dort der gesuchte Knoten ermittelt und dessen Status verwendet.
   * @param  node  Knoten, der aktualisiert werden soll
   * @param  ret   Ausgabe des Testlaufs
   * @returns      Gibt alle aktualisierten Testknoten zurück.
   */
  private updateNodeFromString(
    node: BanditTestNode,
    ret: SpawnReturnsI
  ): BanditTestNode[] {
    let nodes = new Array<BanditTestNode>();
    if (ret.cancelled) {
      nodes = node.cancel();
    } else {
      let parsedResult = this.parseString(ret.stdout);
      let resultNode = parsedResult.testsuite.find(node.id);
      if (resultNode) {
        Logger.instance.debug(
          `Status "${resultNode.status}" für Test "${node.id}" erkannt`
        );
        nodes = node.finish(resultNode.status, resultNode.message);
      } else {
        Logger.instance.warn(
          `In der Testausgabe konnte der Test "${
            node.id
          }" nicht gefunden werden`
        );
        nodes = node.finish(teststatus.Skipped);
      }
    }
    return nodes;
  }
}
