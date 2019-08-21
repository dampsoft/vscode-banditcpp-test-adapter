/**
 * Verwende den Chokidar Filesystem watcher:
 * https://github.com/paulmillr/chokidar
 */

var chokidar = require('chokidar');

export type ReadyHandler = () => void;
export type ChangeHandler =
  ((path: string) => void) | ((path: string, stat: any) => void);
export type ErrorHandler = (error: Error | string) => void;

export class DisposableWatcher {
  private readonly watch: any;

  constructor(
    files: string[], onReady: ReadyHandler, onChange: ChangeHandler,
    onError: ErrorHandler) {
    this.watch =
      chokidar.watch(files, { ignored: /(^|[\/\\])\../, persistent: true });
    this.watch.on('change', onChange);
    this.watch.on('error', onError);
    this.watch.on('ready', onReady);
  }

  public dispose(): void {
    this.watch.close();
  }
}
