import {ProgressLocation, window} from 'vscode';

export class ProgressStatus {
  private stepsIntern: number;
  private stepsMaxIntern: number;
  private incrementIntern: number = 0;
  constructor(steps: number, stepsMax: number) {
    this.stepsIntern = steps;
    this.stepsMaxIntern = stepsMax;
    this.updateIncrement(steps, this.stepsMax);
  }
  public get steps(): number {
    return this.stepsIntern;
  }
  public get stepsMax(): number {
    return this.stepsMaxIntern;
  }
  public set steps(val: number) {
    this.updateIncrement(val, this.stepsMax);
    this.stepsIntern = val;
  }
  public set stepsMax(val: number) {
    this.updateIncrement(this.steps, val);
    this.stepsMaxIntern = val;
  }
  public get increment(): number {
    return this.incrementIntern;
  }
  public get progress(): number {
    return this.steps / this.stepsMax;
  }
  private updateIncrement(steps: number, max: number) {
    let progressNew = steps / max;
    let progressOld = this.steps / this.stepsMax;
    this.incrementIntern = progressNew - progressOld;
  }
}

interface ProgressBoxI {
  progress(status: ProgressStatus): void;
  close(): void;
}

var progresshandler = new Map<string, ProgressBoxI>();

export class ProgressBox<T extends ProgressStatus> implements ProgressBoxI {
  private lastProgress = 0;
  constructor(
      private readonly progressHandler:
          (increment: number, message: string) => void,
      private readonly closeHandler: () => void,
      private readonly progressFormatter: (status: T) => string) {}

  public progress(status: T) {
    if (status.progress > this.lastProgress) {
      this.lastProgress = status.progress;
      let message = this.progressFormatter(status);
      this.progressHandler(100 * status.increment, message);
    }
  }

  public close() {
    this.closeHandler();
  }

  public static show<T extends ProgressStatus>(
      id: string, title: string, progressFormatter: (status: T) => string,
      cancellationHandler?: () => void) {
    window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: title,
          cancellable: cancellationHandler != undefined
        },
        (progress, token) => {
          return new Promise(resolve => {
            // Final no response timeout:
            let createTimeout = (time: number) => {
              return setTimeout(() => {
                this.remove(id);
                resolve();
              }, time);
            };
            let timeout = createTimeout(30000);
            token.onCancellationRequested(() => {
              clearTimeout(timeout);
              if (cancellationHandler) {
                cancellationHandler();
              }
              this.remove(id);
              resolve();
            });
            // progress.report({increment: 0});
            let progressHandler = (increment: number, message: string) => {
              clearTimeout(timeout);
              timeout = createTimeout(30000);
              progress.report({increment: increment, message: message});
            };
            let closeHandler = () => {
              clearTimeout(timeout);
              timeout = createTimeout(2000);
            };
            progresshandler.set(
                id,
                new ProgressBox<T>(
                    progressHandler, closeHandler, progressFormatter));
          });
        });
  }

  public static progress(id: string, status: ProgressStatus) {
    let handler = progresshandler.get(id);
    if (handler) {
      handler.progress(status);
    }
  }

  public static close(id: string) {
    let handler = progresshandler.get(id);
    if (handler) {
      handler.close();
    }
  }

  private static remove(id: string) {
    progresshandler.delete(id);
  }
}
