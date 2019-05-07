
import {MessageWrapper} from '../locale/MessageWrapper';
import {Message} from '../util/message';

export class Messages {
  private static wrapperTestsuiteIdAmbiguousTitle = new MessageWrapper(
      'configuration.testsuite_ambiguous.title',
      'Invalid testsuite configuration');
  private static wrapperTestsuiteIdAmbiguousBody = new MessageWrapper(
      'configuration.testsuite_ambiguous.text',
      'A testsuite with id "{0}" already exists.', 1);
  public static getTestsuiteIdAmbiguous(id: string): Message {
    const title = Messages.wrapperTestsuiteIdAmbiguousTitle.get();
    const body = Messages.wrapperTestsuiteIdAmbiguousBody.get(id);
    return Message.warn(title, body);
  }

  private static wrapperTestsuiteConfigInvalidTitle = new MessageWrapper(
      'configuration.testsuite_invalid.title',
      'Invalid testsuite configuration');
  private static wrapperTestsuiteConfigInvalidBody = new MessageWrapper(
      'configuration.testsuite_invalid.text',
      'The Configuration of testsuite with id "{0}" is invalid or incomplete.',
      1);
  public static getTestsuiteConfigInvalid(id: string): Message {
    const title = Messages.wrapperTestsuiteConfigInvalidTitle.get();
    const body = Messages.wrapperTestsuiteConfigInvalidBody.get(id);
    return Message.warn(title, body);
  }
}