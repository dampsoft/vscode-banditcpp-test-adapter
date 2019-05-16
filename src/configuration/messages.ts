
import * as nls from 'vscode-nls';

import {MessageWrapper} from '../locale/MessageWrapper';
import {Message} from '../util/message';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();

export class Messages {
  private static wrapperTestsuiteIdAmbiguousTitle = new MessageWrapper(localize(
      'configuration.testsuite_ambiguous.title',
      'Invalid testsuite configuration'));

  private static wrapperTestsuiteIdAmbiguousBody = new MessageWrapper(
      localize(
          'configuration.testsuite_ambiguous.text',
          'A testsuite with id "{0}" already exists.', '_id_'),
      ['_id_']);

  private static wrapperTestsuiteConfigInvalidTitle =
      new MessageWrapper(localize(
          'configuration.testsuite_invalid.title',
          'Invalid testsuite configuration'));

  private static wrapperTestsuiteConfigInvalidBody = new MessageWrapper(
      localize(
          'configuration.testsuite_invalid.text',
          'The Configuration of testsuite with id "{0}" is invalid or incomplete.',
          '_id_'),
      ['_id_']);

  private static wrapperTestsuiteConfigWatchTitle = new MessageWrapper(localize(
      'configuration.testsuite_watch.title',
      'Watching test suite configuration'));
  private static wrapperTestsuiteConfigWatchReadyBody = new MessageWrapper(
      localize(
          'configuration.testsuite_watch_ready.text',
          'Start watching file changes on test suite configuration: "{0}"',
          '_path_'),
      ['_path_']);
  private static wrapperTestsuiteConfigWatchTriggerBody = new MessageWrapper(
      localize(
          'configuration.testsuite_watch_trigger.text',
          'File change on test suite configuration detected: "{0}"', '_path_'),
      ['_path_']);
  private static wrapperTestsuiteConfigWatchErrorBody = new MessageWrapper(
      localize(
          'configuration.testsuite_watch_error.text',
          'There where errors while watching test suite configuration: "{0}"',
          '_path_'),
      ['_path_']);


  /**************************** Config ****************************/

  public static getTestsuiteIdAmbiguous(id: string): Message {
    const title = Messages.wrapperTestsuiteIdAmbiguousTitle.get();
    const body = Messages.wrapperTestsuiteIdAmbiguousBody.get(id);
    return Message.warn(title, body);
  }

  public static getTestsuiteConfigInvalid(id: string): Message {
    const title = Messages.wrapperTestsuiteConfigInvalidTitle.get();
    const body = Messages.wrapperTestsuiteConfigInvalidBody.get(id);
    return Message.warn(title, body);
  }

  /**************************** Watch ****************************/

  public static getTestsuiteConfigurationWatchReady(path: string): Message {
    const title = Messages.wrapperTestsuiteConfigWatchTitle.get();
    const body = Messages.wrapperTestsuiteConfigWatchReadyBody.get(path);
    return Message.debug(title, body);
  }

  public static getTestsuiteConfigurationWatchTrigger(path: string): Message {
    const title = Messages.wrapperTestsuiteConfigWatchTitle.get();
    const body = Messages.wrapperTestsuiteConfigWatchTriggerBody.get(path);
    return Message.debug(title, body);
  }

  public static getTestsuiteConfigurationWatchError(path: string): Message {
    const title = Messages.wrapperTestsuiteConfigWatchTitle.get();
    const body = Messages.wrapperTestsuiteConfigWatchErrorBody.get(path);
    return Message.debug(title, body);
  }
}