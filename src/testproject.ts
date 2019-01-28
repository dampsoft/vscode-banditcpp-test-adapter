
import {BanditSpawner} from './bandit';
import {BanditTestSuiteConfigurationI} from './configuration';
import {Logger} from './helper';
import {BanditTestSuite, NotifyFinishHandler, NotifyStartHandler, NotifyStatusHandler} from './testsuite';
import {DisposableWatcher} from './watch';

interface DisposableI {
  dispose(): void
}

export type OnTestsuiteChangeHandler = () => void;

export class TestSuiteBase implements DisposableI {
  private watch: DisposableI|undefined;
  private changeTimeout: NodeJS.Timer|undefined;
  private testsuite: BanditTestSuite;

  constructor(
      private readonly configuration: BanditTestSuiteConfigurationI,  //
      private readonly onChange: OnTestsuiteChangeHandler,            //
      private readonly onStatusChange: NotifyStatusHandler,           //
      private readonly onStart: NotifyStartHandler,                   //
      private readonly onFinish: NotifyFinishHandler,                 //
      private readonly timeout: number,                               //
      private readonly log: Logger) {
    this.reload();
  }

  public dispose() {
    this.watch.dispose();
    this.watch = undefined;
  }

  public start(ids: (string|RegExp)[]): Promise<void> {
    return this.testsuite.start(ids);
  }

  public cancel() {
    this.testsuite.cancel();
  }

  public reload() {
    let testsuiteSpawner = new BanditSpawner(this.configuration, this.log);
    this.testsuite = new BanditTestSuite(
        this.configuration.name, testsuiteSpawner, this.log,
        this.onStatusChange, this.onStart, this.onFinish);
    this.resetWatch();
  }

  private resetWatch() {
    if (this.watch) {
      this.watch.dispose();
    }
    let paths: string[];
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
        this.onChange();
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