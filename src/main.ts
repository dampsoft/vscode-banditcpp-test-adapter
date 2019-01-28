import * as vscode from 'vscode';
import {testExplorerExtensionId, TestHub} from 'vscode-test-adapter-api';
import {Log, TestAdapterRegistrar} from 'vscode-test-adapter-util';

import {BanditTestAdapter} from './adapter';
import {Logger} from './helper';
import {Spawner} from './spawner'

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

  // create a simple logger that can be configured with the configuration
  // variables `banditTestExplorer.logpanel` and `banditTestExplorer.logfile`
  const log =
      new Log('banditTestExplorer', workspaceFolder, 'Bandit Test Explorer');
  context.subscriptions.push(log);
  const logger = new Logger(log);

  // get the Test Explorer extension
  const testExplorerExtension =
      vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
  logger.info(`Test Explorer ${testExplorerExtension ? '' : 'nicht '}gefunden`);
  Spawner.instance.setLog(logger);

  if (testExplorerExtension) {
    if (!testExplorerExtension.isActive) {
      await testExplorerExtension.activate();
    }
    const testHub = testExplorerExtension.exports;

    // this will register an ExampleTestAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
        testHub,
        workspaceFolder => new BanditTestAdapter(workspaceFolder, logger),
        log));
  }
}
