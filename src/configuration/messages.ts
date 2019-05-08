
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
}