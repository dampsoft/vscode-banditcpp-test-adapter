import * as vscode from 'vscode';
import { ProgressLocation, window } from 'vscode';
import { ProgressStatusI } from './state';
import { Icon } from '../../util/icons';


export type visualizerType = 'dialogBox' | 'statusBar';


interface ProgressVisualizerI {
  progress(status: ProgressStatusI): void;
  close(): void;
}


// Timeout in ms for closing the visualizer automatically.
var autoCloseTimeout = 2000;

// DialogBox Variant
class ProgressDialogBox<T extends ProgressStatusI> implements
  ProgressVisualizerI {
  private lastProgress = 0;
  constructor(
    private readonly progressHandler:
      (increment: number, message: string) => void,
    private readonly progressFormatter: (status: T) => string,
    private readonly closeHandler: () => void) { }

  public progress(status: T) {
    let increment =
      (status.progress > this.lastProgress) ? status.increment : 0;
    this.lastProgress = status.progress;
    let message = this.progressFormatter(status);
    this.progressHandler(100 * increment, message);
  }

  public close() {
    this.closeHandler();
  }

  public static show<T extends ProgressStatusI>(
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
              resolve();
            }, time);
          };
          let timeout = createTimeout(30000);
          token.onCancellationRequested(() => {
            clearTimeout(timeout);
            if (cancellationHandler) {
              cancellationHandler();
            }
            resolve();
          });
          // progress.report({increment: 0});
          let progressHandler = (increment: number, message: string) => {
            clearTimeout(timeout);
            timeout = createTimeout(30000);
            progress.report({ increment: increment, message: message });
          };
          let closeHandler = () => {
            clearTimeout(timeout);
            timeout = createTimeout(autoCloseTimeout);
          };
          Progress.addVisualizer(
            id,
            new ProgressDialogBox(
              progressHandler, progressFormatter, closeHandler));
        });
      });
  }
}


// ProgressBar Variant
class ProgressStatusBarItem<T extends ProgressStatusI> implements
  ProgressVisualizerI {
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly title: string,
    private readonly progressFormatter: (status: T) => string,
    private readonly closeHandler?: () => void,
    private readonly maxSize?: number, private readonly icon?: Icon) {
    this.statusBarItem =
      vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  }

  public progress(status: T) {
    this.statusBarItem.text = `${this.getIconPlaceholder()} ${this.title} (${status.steps}/${
      status.stepsMax}) ${this.getAsciiProgress(status)}`.trimLeft();
    this.statusBarItem.tooltip = this.progressFormatter(status);
    this.statusBarItem.show();
  }

  public close() {
    if (this.closeHandler) {
      this.closeHandler();
    }
    setTimeout(() => {
      this.statusBarItem.hide();
    }, autoCloseTimeout);
  }

  private getAsciiProgress(status: T) {
    let barCount = Math.min(status.stepsMax, this.maxSize || 15);
    let preCount = Math.floor(status.progress * barCount);
    let remCount = Math.floor((1 - status.progress) * barCount);
    let midCount = barCount - preCount - remCount;
    let pre = '█'.repeat(preCount);
    let mid = '▓'.repeat(midCount);
    let rem = '▒'.repeat(remCount);
    return `${pre}${mid}${rem}`;
  }

  private getIconPlaceholder() {
    return this.icon ? this.icon.toPlaceholder() : "";
  }

  public static show<T extends ProgressStatusI>(
    id: string, title: string, progressFormatter: (status: T) => string,
    cancellationHandler?: () => void, icon?: Icon) {
    Progress.addVisualizer(
      id,
      new ProgressStatusBarItem<T>(
        title, progressFormatter, cancellationHandler, undefined, icon));
  }
}


// Progress class
export class Progress {
  public static showDialogBox<T extends ProgressStatusI>(
    id: string, title: string, progressFormatter: (status: T) => string,
    cancellationHandler?: () => void) {
    ProgressDialogBox.show<T>(
      id, title, progressFormatter, cancellationHandler);
  }

  public static showStatusBar<T extends ProgressStatusI>(
    id: string, title: string, progressFormatter: (status: T) => string,
    cancellationHandler?: () => void, icon?: Icon) {
    ProgressStatusBarItem.show(
      id, title, progressFormatter, cancellationHandler, icon);
  }

  public static progress(id: string, status: ProgressStatusI) {
    let handler = this.progressVisualizers.get(id);
    if (handler) {
      handler.progress(status);
    }
  }

  public static close(id: string) {
    let handler = this.progressVisualizers.get(id);
    if (handler) {
      handler.close();
      this.remove(id);
    }
  }

  private static remove(id: string) {
    this.progressVisualizers.delete(id);
  }

  public static addVisualizer(id: string, visualizer: ProgressVisualizerI) {
    this.progressVisualizers.set(id, visualizer);
  }

  // Registered visualizers
  private static progressVisualizers = new Map<string, ProgressVisualizerI>();
}