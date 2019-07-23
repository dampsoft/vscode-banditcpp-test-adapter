
import * as nls from 'vscode-nls';

import {MessageWrapper} from './locale/MessageWrapper';
import {Message} from './util/message';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();


export class Messages {
  private static wrapperAdapterTitle =
      new MessageWrapper(localize('adapter.title', 'Adapter'));
  private static wrapperAdapterInitializeBody = new MessageWrapper(
      localize('adapter.initialize.text', 'Initialize bandit test adapter'));
  private static wrapperAdapterLoadBody =
      new MessageWrapper(localize('adapter.load.text', 'Loading tests'));
  private static wrapperAdapterLoadErrorBody = new MessageWrapper(
      localize(
          'adapter.load_error.text', 'Error while loading tests: {0}',
          '_message_'),
      ['_message_']);
  private static wrapperAdapterLoadErrorUnknownBody =
      new MessageWrapper(localize(
          'adapter.load_error_unknown.text',
          'Unknown error while loading tests'));
  private static wrapperAdapterStartBody = new MessageWrapper(
      localize('adapter.run.text', 'Starting tests: {0}', '_filter_'),
      ['_filter_']);
  private static wrapperAdapterStartErrorBody = new MessageWrapper(
      localize(
          'adapter.run_error.text', 'Error while starting tests: {0}',
          '_message_'),
      ['_message_']);
  private static wrapperAdapterStartErrorUnknownBody =
      new MessageWrapper(localize(
          'adapter.run_error_unknown.text',
          'Unknown error while starting tests'));

  private static wrapperAdapterCancelErrorBody = new MessageWrapper(
      localize(
          'adapter.cancel_error.text', 'Error while cancelling tests: {0}',
          '_message_'),
      ['_message_']);
  private static wrapperAdapterCancelErrorUnknownBody =
      new MessageWrapper(localize(
          'adapter.cancel_error_unknown.text',
          'Unknown error while cancelling tests'));


  private static wrapperAdapterCommandRunTestsFilteredTitle =
      new MessageWrapper(
          localize('adapter.command.run_filtered.title', 'Test execution'));
  private static wrapperAdapterCommandRunTestsFilteredPlaceholder =
      new MessageWrapper(localize(
          'adapter.command.run_filtered.placeholder',
          'Insert your filter string here to run tests or test suites.'));
  private static wrapperAdapterCommandRunTestsFilteredErrorBody =
      new MessageWrapper(
          localize(
              'adapter.command.run_filtered_error.text',
              'No test could be found for search strings "{0}".', '_filter_'),
          ['_filter']);

  private static wrapperAdapterDebugNotImplementedErrorBody =
      new MessageWrapper(localize(
          'adapter.debug_not_implemented_warning.text',
          'Debugging ist not implemented yet!'));


  /**************************** Adapter ****************************/

  public static getAdapterInitializeInfo(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterInitializeBody.get();
    return Message.info(title, body);
  }

  public static getAdapterLoadInfo(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterLoadBody.get();
    return Message.info(title, body);
  }

  public static getAdapterLoadError(message: string): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterLoadErrorBody.get(message);
    return Message.error(title, body);
  }

  public static getAdapterLoadErrorUnknown(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterLoadErrorUnknownBody.get();
    return Message.error(title, body);
  }

  public static getAdapterStartInfo(filter: string): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterStartBody.get(filter);
    return Message.info(title, body);
  }

  public static getAdapterStartError(message: string): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterStartErrorBody.get(message);
    return Message.error(title, body);
  }

  public static getAdapterStartErrorUnknown(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterStartErrorUnknownBody.get();
    return Message.error(title, body);
  }


  public static getAdapterCancelError(message: string): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterCancelErrorBody.get(message);
    return Message.error(title, body);
  }

  public static getAdapterCancelErrorUnknown(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterCancelErrorUnknownBody.get();
    return Message.error(title, body);
  }

  public static getAdapterDebugNotImplementedWarning(): Message {
    const title = Messages.wrapperAdapterTitle.get();
    const body = Messages.wrapperAdapterDebugNotImplementedErrorBody.get();
    return Message.warn(title, body);
  }


  /**************************** Command ****************************/

  public static getAdapterCommandRunTestsFilteredError(filter: string):
      Message {
    const title = Messages.wrapperAdapterCommandRunTestsFilteredTitle.get();
    const body =
        Messages.wrapperAdapterCommandRunTestsFilteredErrorBody.get(filter);
    return Message.warn(title, body);
  }

  public static getAdapterCommandRunTestsFilteredPlaceholder(): string {
    return Messages.wrapperAdapterCommandRunTestsFilteredPlaceholder.get();
  }
}
