
import * as nls from 'vscode-nls';

import {MessageWrapper} from '../locale/MessageWrapper';
import {formatTimeDuration} from '../util/helper';
import {Message} from '../util/message';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();

export class Messages {
  private static wrapperTestsuiteReloadTitle = new MessageWrapper(
      localize('testsuite.reload.title', 'Loading test suite'));
  private static wrapperTestsuiteReloadStartBody = new MessageWrapper(
      localize(
          'testsuite.reload_start.text',
          'Start to reload test suite with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestsuiteReloadFinishedValidBody = new MessageWrapper(
      localize(
          'testsuite.reload_finished_valid.text',
          'Reload of test suite with id "{0}" completed. {1}', '_id_',
          '_result_'),
      ['_id_', '_result_']);
  private static wrapperTestsuiteReloadFinishedInvalidBody = new MessageWrapper(
      localize(
          'testsuite.reload_finished_invalid.text',
          'There where errors while reloading test suite with id "{0}": {1}',
          '_id_', '_result_'),
      ['_id_', '_result_']);
  private static wrapperTestsuiteRunTitle =
      new MessageWrapper(localize('testsuite.run.title', 'Running tests'));
  private static wrapperTestsuiteRunStartBody = new MessageWrapper(
      localize(
          'testsuite.run_start.text',
          'Starting {0} tests of test suite with id "{1}"', '_count_', '_id_'),
      ['_count_', '_id_']);
  private static wrapperTestsuiteRunCancelBody = new MessageWrapper(
      localize(
          'testsuite.run_cancel.text',
          'Cancel all running tests of test suite with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestsuiteWatchTitle = new MessageWrapper(
      localize('testsuite.watch.title', 'Watching test suite'));
  private static wrapperTestsuiteWatchReadyBody = new MessageWrapper(
      localize(
          'testsuite.watch_ready.text',
          'Start watching file changes on test suite with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestsuiteWatchTriggerBody = new MessageWrapper(
      localize(
          'testsuite.watch_trigger.text',
          'File change on test suite with id "{0}" detected: "{1}"', '_id_',
          '_path_'),
      ['_id_', '_path_']);
  private static wrapperTestsuiteWatchErrorBody = new MessageWrapper(
      localize(
          'testsuite.watch_error.text',
          'There where errors while watching test suite with id "{0}"', '_id_'),
      ['_id_']);


  /**************************** Reload ****************************/

  public static getTestsuiteReloadStart(id: string): Message {
    const title = Messages.wrapperTestsuiteReloadTitle.get();
    const body = Messages.wrapperTestsuiteReloadStartBody.get(id);
    return Message.debug(title, body);
  }

  public static getTestsuiteReloadFinishedValid(id: string, duration: number):
      Message {
    const title = Messages.wrapperTestsuiteReloadTitle.get();
    const body = Messages.wrapperTestsuiteReloadFinishedValidBody.get(
        id, formatTimeDuration(duration));
    return Message.debug(title, body);
  }

  public static getTestsuiteReloadFinishedInvalid(id: string, duration: number):
      Message {
    const title = Messages.wrapperTestsuiteReloadTitle.get();
    const body = Messages.wrapperTestsuiteReloadFinishedInvalidBody.get(
        id, formatTimeDuration(duration));
    return Message.warn(title, body);
  }


  /**************************** Run ****************************/

  public static getTestsuiteRunStart(id: string, count: number): Message {
    const title = Messages.wrapperTestsuiteRunTitle.get();
    const body = Messages.wrapperTestsuiteRunStartBody.get(count, id);
    return Message.debug(title, body);
  }

  public static getTestsuiteRunCancel(id: string): Message {
    const title = Messages.wrapperTestsuiteRunTitle.get();
    const body = Messages.wrapperTestsuiteRunCancelBody.get(id);
    return Message.debug(title, body);
  }


  /**************************** Watch ****************************/

  public static getTestsuiteWatchReady(id: string): Message {
    const title = Messages.wrapperTestsuiteWatchTitle.get();
    const body = Messages.wrapperTestsuiteWatchReadyBody.get(id);
    return Message.debug(title, body);
  }

  public static getTestsuiteWatchTrigger(id: string, path: string): Message {
    const title = Messages.wrapperTestsuiteWatchTitle.get();
    const body = Messages.wrapperTestsuiteWatchTriggerBody.get(id, path);
    return Message.debug(title, body);
  }

  public static getTestsuiteWatchError(id: string): Message {
    const title = Messages.wrapperTestsuiteWatchTitle.get();
    const body = Messages.wrapperTestsuiteWatchErrorBody.get(id);
    return Message.debug(title, body);
  }
}
