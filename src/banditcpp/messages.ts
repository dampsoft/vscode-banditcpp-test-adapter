import {MessageWrapper} from '../locale/MessageWrapper';
import {Message} from '../util/message';

export class Messages {
  private static wrapperInfoNewGroup =
      new MessageWrapper('bandit.new_group.title', 'New test group');
  public static getInfoNewGroup(id: string): Message {
    const title = Messages.wrapperInfoNewGroup.get();
    return Message.debug(title, id);
  }

  private static wrapperInfoNewTest =
      new MessageWrapper('bandit.new_test.title', 'New test');
  public static getInfoNewTest(id: string): Message {
    const title = Messages.wrapperInfoNewTest.get();
    return Message.debug(title, id);
  }

  private static wrapperInfoErrorsDetected = new MessageWrapper(
      'bandit.test_error_detected.title',
      'Error message for test with id "{0}" detected', 1);
  public static getInfoErrorsDetected(id: string, message: string): Message {
    const title = Messages.wrapperInfoErrorsDetected.get(id);
    return Message.warn(title, message);
  }

  private static wrapperMissingNodeParent = new MessageWrapper(
      'bandit.missing_parent.text', 'Missing parent at node with id \"{0}\"',
      1);
  public static getMissingNodeParent(id: string): string {
    const e = Messages.wrapperMissingNodeParent.get(id);
    return e;
  }

  private static wrapperAmbiguousGroupTitle = new MessageWrapper(
      'bandit.ambiguous_group.title', 'Ambiguous test group');
  private static wrapperAmbiguousGroupBody = new MessageWrapper(
      'bandit.ambiguous_group.text',
      'A group with label "{0}" already exists inside group "{1}"', 2);
  public static getAmbiguousGroup(ambiguousId: string, parentId: string):
      Message {
    const title = Messages.wrapperAmbiguousGroupTitle.get();
    const body = Messages.wrapperAmbiguousGroupBody.get(ambiguousId, parentId);
    return Message.warn(title, body);
  }

  private static wrapperAmbiguousTestTitle =
      new MessageWrapper('bandit.ambiguous_test.title', 'Ambiguous test');
  private static wrapperAmbiguousTestBody = new MessageWrapper(
      'bandit.ambiguous_test.text',
      'A test with label "{0}" already exists inside group "{1}"', 2);
  public static getAmbiguousTest(ambiguousId: string, parentId: string):
      Message {
    const title = Messages.wrapperAmbiguousTestTitle.get();
    const body = Messages.wrapperAmbiguousTestBody.get(ambiguousId, parentId);
    return Message.warn(title, body);
  }

  private static wrapperEmptyNodeLabelTitle =
      new MessageWrapper('bandit.empty_node_label.title', 'Invalid test');
  private static wrapperEmptyNodeLabelBody = new MessageWrapper(
      'bandit.empty_node_label.text',
      'A test with invalid empty label detected inside group "{0}". Test will be ignored.',
      1);
  public static getEmptyNodeLabel(parentId: string): Message {
    const title = Messages.wrapperEmptyNodeLabelTitle.get();
    const body = Messages.wrapperEmptyNodeLabelBody.get(parentId);
    return Message.warn(title, body);
  }
}