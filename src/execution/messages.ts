
import {MessageWrapper} from '../locale/MessageWrapper';
import {TestStatus} from '../project/teststatus';
import {Message} from '../util/message';

export class Messages {
  /**************************** Spawn request ****************************/

  private static wrapperSpawnerProcessRequestTitle =
      new MessageWrapper('spawner.execution.title', 'Process execution');
  private static wrapperSpawnerProcessRequestBody = new MessageWrapper(
      'spawner.execution_request.text', 'New request with id "{0}"', 1);
  public static getSpawnerProcessRequest(id: string): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body = Messages.wrapperSpawnerProcessRequestBody.get(id);
    return Message.debug(title, body);
  }

  private static wrapperSpawnerProcessStartBody = new MessageWrapper(
      'spawner.execution_start.text',
      'Process with id "{0}" starting with command "{1}"', 2);
  public static getSpawnerProcessStart(id: string, cmd: string): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body = Messages.wrapperSpawnerProcessStartBody.get(id, cmd);
    return Message.debug(title, body);
  }

  private static wrapperSpawnerProcessFinishedValidBody = new MessageWrapper(
      'spawner.execution_finished_valid.text',
      'Process with id "{0}" completed with signal "{1}" and return code "{2}"',
      3);
  public static getSpawnerProcessFinishedValid(
      id: string, signal: string, code: number): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body =
        Messages.wrapperSpawnerProcessFinishedValidBody.get(id, signal, code);
    return Message.debug(title, body);
  }

  private static wrapperSpawnerProcessFinishedInvalidBody = new MessageWrapper(
      'spawner.execution_finished_invalid.text',
      'Process with id "{0}" failed with signal "{1}" and return code "{2}"',
      3);
  public static getSpawnerProcessFinishedInvalid(
      id: string, signal: string, code: number): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body =
        Messages.wrapperSpawnerProcessFinishedInvalidBody.get(id, signal, code);
    return Message.error(title, body);
  }


  /**************************** Wrong Id ****************************/

  private static wrapperSpawnerProcessIdAlreadyExistsTitle = new MessageWrapper(
      'spawner.execution_id_already_exists.title', 'Invalid execution request');
  private static wrapperSpawnerProcessIdAlreadyExistsBody = new MessageWrapper(
      'spawner.execution_id_already_exists.text',
      'A process with id "{0}" already exists', 1);
  public static getSpawnerProcessIdAlreadyExists(id: string): Message {
    const title = Messages.wrapperSpawnerProcessIdAlreadyExistsTitle.get();
    const body = Messages.wrapperSpawnerProcessIdAlreadyExistsBody.get(id);
    return Message.error(title, body);
  }


  /**************************** Execution error ****************************/

  private static wrapperTestQueueExecutionErrorTitle =
      new MessageWrapper('testqueue.execution_error.title', 'Execution error');
  private static wrapperTestQueueExecutionErrorBody = new MessageWrapper(
      'testqueue.execution_error.text',
      'Error during the execution of test with id "{0}"', 1);
  public static getTestQueueExecutionError(id: string): Message {
    const title = Messages.wrapperTestQueueExecutionErrorTitle.get();
    const body = Messages.wrapperTestQueueExecutionErrorBody.get(id);
    return Message.error(title, body);
  }


  /**************************** Version detection ****************************/

  private static wrapperTestSpawnerDetectFrameworkVersionTitle =
      new MessageWrapper(
          'testspawner.detect_version.title', 'Detecting framework version');
  private static wrapperTestSpawnerDetectFrameworkVersionStartBody =
      new MessageWrapper(
          'testspawner.detect_version_start.text',
          'Start to evaluate the framework version of project with id "{0}"',
          1);
  public static getTestSpawnerDetectFrameworkVersionStart(id: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionStartBody.get(id);
    return Message.debug(title, body);
  }

  private static wrapperTestSpawnerDetectFrameworkVersionFinishedValidBody =
      new MessageWrapper(
          'testspawner.detect_version_finished_valid.text',
          'Detected framework version of project with id "{0}": "{1}"', 2);
  public static getTestSpawnerDetectFrameworkVersionFinishedValid(
      id: string, version: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionFinishedValidBody.get(
            id, version);
    return Message.debug(title, body);
  }

  private static wrapperTestSpawnerDetectFrameworkVersionFinishedInvalidBody =
      new MessageWrapper(
          'testspawner.detect_version_finished_invalid.text',
          'Could not detect the framework version of project with id "{0}". Using: "{1}"',
          2);
  public static getTestSpawnerDetectFrameworkVersionFinishedInvalid(
      id: string, version: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionFinishedInvalidBody
            .get(id, version);
    return Message.warn(title, body);
  }

  private static wrapperTestSpawnerDetectFrameworkVersionErrorBody =
      new MessageWrapper(
          'testspawner.detect_version_failed.text',
          'Error while detecting the framework version of project with id "{0}"',
          1);
  public static getTestSpawnerDetectFrameworkVersionError(
      id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionErrorBody.get(id);
    return Message.fromException(title, body, error);
  }


  /**************************** Dry run ****************************/

  private static wrapperTestSpawnerDryRunTitle =
      new MessageWrapper('testspawner.dry_run.title', 'Dry test run');
  private static wrapperTestSpawnerDryRunFinishedInvalidBody =
      new MessageWrapper(
          'testspawner.dry_run_returned_invalid.text',
          'Invalid return value of the dry test run of project with id "{0}"',
          1);
  public static getTestSpawnerDryRunFinishedInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunFinishedInvalidBody.get(id);
    return Message.error(title, body);
  }

  private static wrapperTestSpawnerDryRunFinishedValidBody = new MessageWrapper(
      'testspawner.dry_run_returned_valid.text',
      'Dry test run of project with id "{0}" completed', 1);
  public static getTestSpawnerDryRunFinishedValid(id: string): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunFinishedValidBody.get(id);
    return Message.debug(title, body);
  }

  private static wrapperTestSpawnerDryRunErrorBody = new MessageWrapper(
      'testspawner.dry_run_failed.text',
      'Error during the dry test run of project with id "{0}"', 1);
  public static getTestSpawnerDryRunError(id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunErrorBody.get(id);
    return Message.fromException(title, body, error);
  }


  /**************************** Test run ****************************/

  private static wrapperTestSpawnerTestRunTitle =
      new MessageWrapper('testspawner.test_run.title', 'Test run');
  private static wrapperTestSpawnerTestRunFinishedInvalidBody =
      new MessageWrapper(
          'testspawner.test_run_returned_invalid.text',
          'Invalid return value of the test run id "{0}"', 1);
  public static getTestSpawnerTestRunFinishedInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunFinishedInvalidBody.get(id);
    return Message.error(title, body);
  }

  private static wrapperTestSpawnerTestRunFinishedValidBody =
      new MessageWrapper(
          'testspawner.test_run_returned_valid.text',
          'Test run with id "{0}" completed', 1);
  public static getTestSpawnerTestRunFinishedValid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunFinishedValidBody.get(id);
    return Message.debug(title, body);
  }


  private static wrapperTestSpawnerTestRunErrorBody = new MessageWrapper(
      'testspawner.test_run_failed.text',
      'Error during the test run of test with id "{0}"', 1);
  public static getTestSpawnerTestRunError(id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunErrorBody.get(id);
    return Message.fromException(title, body, error);
  }

  private static wrapperTestSpawnerStopRunningProcessesHardBody =
      new MessageWrapper(
          'testspawner.test_run_stop_hard.text',
          'All running processes for project with id "{0}" will be cancelled hard',
          1);
  private static wrapperTestSpawnerStopRunningProcessesSoftBody =
      new MessageWrapper(
          'testspawner.test_run_stop_soft.text',
          'All running processes for project with id "{0}" will be cancelled normally',
          1);
  public static getTestSpawnerStopRunningProcesses(
      id: string, allowKillAll: boolean): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = allowKillAll ?
        Messages.wrapperTestSpawnerStopRunningProcessesHardBody.get(id) :
        Messages.wrapperTestSpawnerStopRunningProcessesSoftBody.get(id);
    return Message.debug(title, body);
  }

  private static wrapperTestSpawnerTestResultUpdateValidTitle =
      new MessageWrapper(
          'testspawner.test_result_update_valid.title', 'Test result found');
  private static wrapperTestSpawnerTestResultUpdateValidBody =
      new MessageWrapper(
          'testspawner.test_result_update_valid.text',
          'Test with id "{0}" updated: {1}', 2);
  public static getTestSpawnerTestResultUpdateValid(
      id: string, status: TestStatus): Message {
    const title = Messages.wrapperTestSpawnerTestResultUpdateValidTitle.get();
    const body =
        Messages.wrapperTestSpawnerTestResultUpdateValidBody.get(id, status);
    return Message.debug(title, body);
  }

  private static wrapperTestSpawnerTestResultUpdateInvalidTitle =
      new MessageWrapper(
          'testspawner.test_result_update_invalid.title',
          'Test result not found');
  private static wrapperTestSpawnerTestResultUpdateInvalidBody =
      new MessageWrapper(
          'testspawner.test_result_update_valid.text',
          'Test with id "{0}" updated: {1}', 2);
  public static getTestSpawnerTestResultUpdateInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestResultUpdateInvalidTitle.get();
    const body = Messages.wrapperTestSpawnerTestResultUpdateInvalidBody.get(id);
    return Message.warn(title, body);
  }
}