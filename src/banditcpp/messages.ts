import * as nls from 'vscode-nls';

import {MessageWrapper} from '../locale/MessageWrapper';
import {Message} from '../util/message';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();

export class Messages {
  private static wrapperInfoNewGroup =
      new MessageWrapper(localize('bandit.new_group.title', 'New test group'));
  private static wrapperInfoNewTest =
      new MessageWrapper(localize('bandit.new_test.title', 'New test'));
  private static wrapperInfoErrorsDetected = new MessageWrapper(
      localize(
          'bandit.test_error_detected.title',
          'Error message for test with id "{0}" detected', '_id_'),
      ['_id_']);
  private static wrapperMissingNodeParent = new MessageWrapper(
      localize(
          'bandit.missing_parent.text',
          'Missing parent at node with id \"{0}\"', '_id_'),
      ['_id_']);
  private static wrapperAmbiguousGroupTitle = new MessageWrapper(
      localize('bandit.ambiguous_group.title', 'Ambiguous test group'));
  private static wrapperAmbiguousGroupBody = new MessageWrapper(
      localize(
          'bandit.ambiguous_group.text',
          'A group with label "{0}" already exists inside group "{1}"',
          '_label_', '_group_'),
      ['_label_', '_group_']);
  private static wrapperAmbiguousTestTitle = new MessageWrapper(
      localize('bandit.ambiguous_test.title', 'Ambiguous test'));
  private static wrapperAmbiguousTestBody = new MessageWrapper(
      localize(
          'bandit.ambiguous_test.text',
          'A test with label "{0}" already exists inside group "{1}"',
          '_label_', '_group_'),
      ['_label_', '_group_']);
  private static wrapperEmptyNodeLabelTitle = new MessageWrapper(
      localize('bandit.empty_node_label.title', 'Invalid test'));
  private static wrapperEmptyNodeLabelBody = new MessageWrapper(
      localize(
          'bandit.empty_node_label.text',
          'A test with invalid empty label detected inside group "{0}". Test will be ignored.',
          '_id_'),
      ['_id_']);

  public static getInfoNewGroup(id: string): Message {
    const title = Messages.wrapperInfoNewGroup.get();
    return Message.debug(title, id);
  }

  public static getInfoNewTest(id: string): Message {
    const title = Messages.wrapperInfoNewTest.get();
    return Message.debug(title, id);
  }

  public static getInfoErrorsDetected(id: string, message: string): Message {
    const title = Messages.wrapperInfoErrorsDetected.get(id);
    return Message.warn(title, message);
  }

  public static getMissingNodeParent(id: string): string {
    const e = Messages.wrapperMissingNodeParent.get(id);
    return e;
  }

  public static getAmbiguousGroup(ambiguousId: string, parentId: string):
      Message {
    const title = Messages.wrapperAmbiguousGroupTitle.get();
    const body = Messages.wrapperAmbiguousGroupBody.get(ambiguousId, parentId);
    return Message.warn(title, body);
  }

  public static getAmbiguousTest(ambiguousId: string, parentId: string):
      Message {
    const title = Messages.wrapperAmbiguousTestTitle.get();
    const body = Messages.wrapperAmbiguousTestBody.get(ambiguousId, parentId);
    return Message.error(title, body);
  }

  public static getEmptyNodeLabel(parentId: string): Message {
    const title = Messages.wrapperEmptyNodeLabelTitle.get();
    const body = Messages.wrapperEmptyNodeLabelBody.get(parentId);
    return Message.warn(title, body);
  }
}