/**
 * Verwende den Chokidar Filesystem watcher:
 * https://github.com/paulmillr/chokidar
 */

var chokidar = require('chokidar');

export type ReadyHandler = () => void;
export type ChangeHandler = (path: string) => void;
export type ErrorHandler = (error: Error|string) => void;

export class DisposableWatcher {
  constructor(private readonly watcher: any) {}
  public dispose(): void {
    this.watcher.close();
  }
}

export function createWatcher(
    file: string, onReady: ReadyHandler, onChange: ChangeHandler,
    onError: ErrorHandler): DisposableWatcher {
  let watcher =
      chokidar.watch(file, {ignored: /(^|[\/\\])\../, persistent: true});
  watcher.on('change', onChange);
  watcher.on('error', onError);
  watcher.on('ready', onReady);
  return new DisposableWatcher(watcher);
}