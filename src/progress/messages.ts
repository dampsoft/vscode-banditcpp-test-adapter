import * as nls from 'vscode-nls';

import {MessageWrapper} from '../locale/MessageWrapper';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();

export class Messages {
  private static wrapperLoadingStatusTitle = new MessageWrapper(
      localize('progress.loading.title', 'Loading test projects'));
  private static wrapperLoadingStatusProgress = new MessageWrapper(
      localize(
          'progress.loading.text', '{0} tests, {1} errors, {2} warnings',
          '_tests_', '_errors_', '_warnings_'),
      ['_tests_', '_errors_', '_warnings_']);
  private static wrapperRunningStatusTitle =
      new MessageWrapper(localize('progress.running.title', 'Running tests'));
  private static wrapperRunningStatusProgress = new MessageWrapper(
      localize(
          'progress.running.text',
          '{0} started, {1} passed, {2} failed, {3} skipped', '_started_',
          '_passed_', '_failed_', '_skipped_'),
      ['_started_', '_passed_', '_failed_', '_skipped_']);


  public static getLoadingStatusTitle(): string {
    const msg = Messages.wrapperLoadingStatusTitle.get();
    return msg;
  }

  public static getLoadingStatusProgress(
      tests: number, errors: number, warnings: number): string {
    const msg =
        Messages.wrapperLoadingStatusProgress.get(tests, errors, warnings);
    return msg;
  }

  public static getRunningStatusTitle(): string {
    const msg = Messages.wrapperRunningStatusTitle.get();
    return msg;
  }

  public static getRunningStatusProgress(
      started: number, passed: number, failed: number,
      skipped: number): string {
    const msg = Messages.wrapperRunningStatusProgress.get(
        started, passed, failed, skipped);
    return msg;
  }
}