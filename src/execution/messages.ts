
import * as nls from 'vscode-nls';

import {MessageWrapper} from '../locale/MessageWrapper';
import {TestStatus} from '../project/teststatus';
import {Message} from '../util/message';

const localize = nls.config({messageFormat: nls.MessageFormat.file})();

export class Messages {
  /**************************** Spawn request ****************************/

  private static wrapperSpawnerProcessRequestTitle = new MessageWrapper(
      localize('spawner.execution.title', 'Process execution'));
  private static wrapperSpawnerProcessRequestBody = new MessageWrapper(
      localize(
          'spawner.execution_request.text', 'New request with id "{0}"',
          '_id_'),
      ['_id_']);
  private static wrapperSpawnerProcessStartBody = new MessageWrapper(
      localize(
          'spawner.execution_start.text',
          'Process with id "{0}" starting with command "{1}"', '_id_',
          '_command_'),
      ['_id_', '_command_']);
  private static wrapperSpawnerProcessFinishedValidBody = new MessageWrapper(
      localize(
          'spawner.execution_finished_valid.text',
          'Process with id "{0}" completed with signal "{1}" and return code "{2}"',
          '_id_', '_signal_', '_code_'),
      ['_id_', '_signal_', '_code_']);
  private static wrapperSpawnerProcessFinishedInvalidBody = new MessageWrapper(
      localize(
          'spawner.execution_finished_invalid.text',
          'Process with id "{0}" failed with signal "{1}" and return code "{2}"',
          '_id_', '_signal_', '_code_'),
      ['_id_', '_signal_', '_code_']);
  private static wrapperSpawnerProcessIdAlreadyExistsTitle =
      new MessageWrapper(localize(
          'spawner.execution_id_already_exists.title',
          'Invalid execution request'));
  private static wrapperSpawnerProcessIdAlreadyExistsBody = new MessageWrapper(
      localize(
          'spawner.execution_id_already_exists.text',
          'A process with id "{0}" already exists', '_id_'),
      ['_id_']);
  private static wrapperTestQueueExecutionErrorTitle = new MessageWrapper(
      localize('testqueue.execution_error.title', 'Execution error'));
  private static wrapperTestQueueExecutionErrorBody = new MessageWrapper(
      localize(
          'testqueue.execution_error.text',
          'Error during the execution of test with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestSpawnerDetectFrameworkVersionTitle =
      new MessageWrapper(localize(
          'testspawner.detect_version.title', 'Detecting framework version'));

  private static wrapperTestSpawnerFactoryDetectFrameworkErrorTitle =
      new MessageWrapper(localize(
          'testspawnerfactory.detect_framework_error.title',
          'Framework error'));
  private static wrapperTestSpawnerFactoryDetectFrameworkErrorBody =
      new MessageWrapper(
          localize(
              'testspawnerfactory.detect_framework_error.text',
              'The configured framework of project with id "{0}" invalid: "{1}"',
              '_id_', '_framework_'),
          ['_id_', '_framework_']);

  private static wrapperTestSpawnerDetectFrameworkVersionStartBody =
      new MessageWrapper(
          localize(
              'testspawner.detect_version_start.text',
              'Start to evaluate the framework version of project with id "{0}"',
              '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerDetectFrameworkVersionFinishedValidBody =
      new MessageWrapper(
          localize(
              'testspawner.detect_version_finished_valid.text',
              'Detected framework version of project with id "{0}": "{1}"',
              '_id_', '_version_'),
          ['_id_', '_version_']);
  private static wrapperTestSpawnerDetectFrameworkVersionFinishedInvalidBody =
      new MessageWrapper(
          localize(
              'testspawner.detect_version_finished_invalid.text',
              'Could not detect the framework version of project with id "{0}". Using: "{1}"',
              '_id_', '_version_'),
          ['_id_', '_version_']);
  private static wrapperTestSpawnerDetectFrameworkVersionErrorBody =
      new MessageWrapper(
          localize(
              'testspawner.detect_version_failed.text',
              'Error while detecting the framework version of project with id "{0}"',
              '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerDryRunTitle =
      new MessageWrapper(localize('testspawner.dry_run.title', 'Dry test run'));
  private static wrapperTestSpawnerDryRunFinishedInvalidBody = new MessageWrapper(
      localize(
          'testspawner.dry_run_returned_invalid.text',
          'Invalid return value of the dry test run of project with id "{0}"',
          '_id_'),
      ['_id_']);
  private static wrapperTestSpawnerDryRunFinishedValidBody = new MessageWrapper(
      localize(
          'testspawner.dry_run_returned_valid.text',
          'Dry test run of project with id "{0}" completed', '_id_'),
      ['_id_']);
  private static wrapperTestSpawnerDryRunErrorBody = new MessageWrapper(
      localize(
          'testspawner.dry_run_failed.text',
          'Error during the dry test run of project with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestSpawnerTestRunTitle =
      new MessageWrapper(localize('testspawner.test_run.title', 'Test run'));
  private static wrapperTestSpawnerTestRunFinishedInvalidBody =
      new MessageWrapper(
          localize(
              'testspawner.test_run_returned_invalid.text',
              'Invalid return value of the test run id "{0}"', '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerTestRunFinishedValidBody =
      new MessageWrapper(
          localize(
              'testspawner.test_run_returned_valid.text',
              'Test run with id "{0}" completed', '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerTestRunErrorBody = new MessageWrapper(
      localize(
          'testspawner.test_run_failed.text',
          'Error during the test run of test with id "{0}"', '_id_'),
      ['_id_']);
  private static wrapperTestSpawnerStopRunningProcessesHardBody =
      new MessageWrapper(
          localize(
              'testspawner.test_run_stop_hard.text',
              'All running processes for project with id "{0}" will be cancelled hard',
              '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerStopRunningProcessesSoftBody =
      new MessageWrapper(
          localize(
              'testspawner.test_run_stop_soft.text',
              'All running processes for project with id "{0}" will be cancelled normally',
              '_id_'),
          ['_id_']);
  private static wrapperTestSpawnerTestResultUpdateValidTitle =
      new MessageWrapper(localize(
          'testspawner.test_result_update_valid.title', 'Test result found'));
  private static wrapperTestSpawnerTestResultUpdateValidBody =
      new MessageWrapper(
          localize(
              'testspawner.test_result_update_valid.text',
              'Test with id "{0}" updated: {1}', '_id_', '_result_'),
          ['_id_', '_result_']);
  private static wrapperTestSpawnerTestResultUpdateInvalidTitle =
      new MessageWrapper(localize(
          'testspawner.test_result_update_invalid.title',
          'Test result not found'));
  private static wrapperTestSpawnerTestResultUpdateInvalidBody =
      new MessageWrapper(
          localize(
              'testspawner.test_result_update_invalid.text',
              'Test with id "{0}" could not be updated: {1}', '_id_',
              '_result_'),
          ['_id_', '_result_']);


  public static getSpawnerProcessRequest(id: string): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body = Messages.wrapperSpawnerProcessRequestBody.get(id);
    return Message.debug(title, body);
  }

  public static getSpawnerProcessStart(id: string, cmd: string): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body = Messages.wrapperSpawnerProcessStartBody.get(id, cmd);
    return Message.debug(title, body);
  }

  public static getSpawnerProcessFinishedValid(
      id: string, signal: string, code: number): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body =
        Messages.wrapperSpawnerProcessFinishedValidBody.get(id, signal, code);
    return Message.debug(title, body);
  }

  public static getSpawnerProcessFinishedInvalid(
      id: string, signal: string, code: number): Message {
    const title = Messages.wrapperSpawnerProcessRequestTitle.get();
    const body =
        Messages.wrapperSpawnerProcessFinishedInvalidBody.get(id, signal, code);
    return Message.error(title, body);
  }


  /**************************** Wrong Id ****************************/

  public static getSpawnerProcessIdAlreadyExists(id: string): Message {
    const title = Messages.wrapperSpawnerProcessIdAlreadyExistsTitle.get();
    const body = Messages.wrapperSpawnerProcessIdAlreadyExistsBody.get(id);
    return Message.error(title, body);
  }


  /**************************** Execution error ****************************/

  public static getTestQueueExecutionError(id: string): Message {
    const title = Messages.wrapperTestQueueExecutionErrorTitle.get();
    const body = Messages.wrapperTestQueueExecutionErrorBody.get(id);
    return Message.error(title, body);
  }


  /*************************** Framework detection ***************************/

  public static getTestSpawnerFactoryDetectFrameworkError(
      id: string, framework: string): Message {
    const title =
        Messages.wrapperTestSpawnerFactoryDetectFrameworkErrorTitle.get();
    const body = Messages.wrapperTestSpawnerFactoryDetectFrameworkErrorBody.get(
        id, framework);
    return Message.error(title, body);
  }


  /**************************** Version detection ****************************/

  public static getTestSpawnerDetectFrameworkVersionStart(id: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionStartBody.get(id);
    return Message.debug(title, body);
  }

  public static getTestSpawnerDetectFrameworkVersionFinishedValid(
      id: string, version: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionFinishedValidBody.get(
            id, version);
    return Message.debug(title, body);
  }

  public static getTestSpawnerDetectFrameworkVersionFinishedInvalid(
      id: string, version: string): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionFinishedInvalidBody
            .get(id, version);
    return Message.warn(title, body);
  }

  public static getTestSpawnerDetectFrameworkVersionError(
      id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerDetectFrameworkVersionTitle.get();
    const body =
        Messages.wrapperTestSpawnerDetectFrameworkVersionErrorBody.get(id);
    return Message.fromException(title, body, error);
  }


  /**************************** Dry run ****************************/

  public static getTestSpawnerDryRunFinishedInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunFinishedInvalidBody.get(id);
    return Message.error(title, body);
  }

  public static getTestSpawnerDryRunFinishedValid(id: string): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunFinishedValidBody.get(id);
    return Message.debug(title, body);
  }

  public static getTestSpawnerDryRunError(id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerDryRunTitle.get();
    const body = Messages.wrapperTestSpawnerDryRunErrorBody.get(id);
    return Message.fromException(title, body, error);
  }


  /**************************** Test run ****************************/

  public static getTestSpawnerTestRunFinishedInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunFinishedInvalidBody.get(id);
    return Message.error(title, body);
  }

  public static getTestSpawnerTestRunFinishedValid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunFinishedValidBody.get(id);
    return Message.debug(title, body);
  }


  public static getTestSpawnerTestRunError(id: string, error: any): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = Messages.wrapperTestSpawnerTestRunErrorBody.get(id);
    return Message.fromException(title, body, error);
  }

  public static getTestSpawnerStopRunningProcesses(
      id: string, allowKillAll: boolean): Message {
    const title = Messages.wrapperTestSpawnerTestRunTitle.get();
    const body = allowKillAll ?
        Messages.wrapperTestSpawnerStopRunningProcessesHardBody.get(id) :
        Messages.wrapperTestSpawnerStopRunningProcessesSoftBody.get(id);
    return Message.debug(title, body);
  }

  public static getTestSpawnerTestResultUpdateValid(
      id: string, status: TestStatus): Message {
    const title = Messages.wrapperTestSpawnerTestResultUpdateValidTitle.get();
    const body =
        Messages.wrapperTestSpawnerTestResultUpdateValidBody.get(id, status);
    return Message.debug(title, body);
  }

  public static getTestSpawnerTestResultUpdateInvalid(id: string): Message {
    const title = Messages.wrapperTestSpawnerTestResultUpdateInvalidTitle.get();
    const body = Messages.wrapperTestSpawnerTestResultUpdateInvalidBody.get(id);
    return Message.warn(title, body);
  }
}