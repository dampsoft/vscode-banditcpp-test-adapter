import {MessageWrapper} from '../locale/MessageWrapper';

export class Messages {
  private static wrapperLoadingStatusTitle =
      new MessageWrapper('progress.loading.title', 'Loading test projects');
  public static getLoadingStatusTitle(): string {
    const msg = Messages.wrapperLoadingStatusTitle.get();
    return msg;
  }

  private static wrapperLoadingStatusProgress = new MessageWrapper(
      'progress.loading.text', '{0} tests, {1} errors, {2} warnings', 3);
  public static getLoadingStatusProgress(
      tests: number, errors: number, warnings: number): string {
    const msg =
        Messages.wrapperLoadingStatusProgress.get(tests, errors, warnings);
    return msg;
  }

  private static wrapperRunningStatusTitle =
      new MessageWrapper('progress.running.title', 'Running tests');
  public static getRunningStatusTitle(): string {
    const msg = Messages.wrapperRunningStatusTitle.get();
    return msg;
  }

  private static wrapperRunningStatusProgress = new MessageWrapper(
      'progress.running.text',
      '{0} started, {1} passed, {2} failed, {3} skipped', 4);
  public static getRunningStatusProgress(
      started: number, passed: number, failed: number,
      skipped: number): string {
    const msg = Messages.wrapperRunningStatusProgress.get(
        started, passed, failed, skipped);
    return msg;
  }
}