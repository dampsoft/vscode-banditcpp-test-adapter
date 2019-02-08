import * as vscode from 'vscode';
import {testExplorerExtensionId, TestHub} from 'vscode-test-adapter-api';
import {Log, TestAdapterRegistrar} from 'vscode-test-adapter-util';

import {BanditTestAdapter} from './adapter';
import {Logger} from './logger';

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

  const log =
      new Log('banditTestExplorer', workspaceFolder, 'Bandit Test Explorer');
  context.subscriptions.push(log);
  Logger.instance.setLog(log);

  const testExplorerExtension =
      vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
  Logger.instance.info(
      `Test Explorer ${testExplorerExtension ? '' : 'nicht '}gefunden`);

  if (testExplorerExtension) {
    if (!testExplorerExtension.isActive) {
      await testExplorerExtension.activate();
    }
    const testHub = testExplorerExtension.exports;

    context.subscriptions.push(new TestAdapterRegistrar(
        testHub, workspaceFolder => new BanditTestAdapter(workspaceFolder),
        log));
  }
}
