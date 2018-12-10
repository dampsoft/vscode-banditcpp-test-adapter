import * as vscode from 'vscode';
import {TestExplorerExtension, testExplorerExtensionId} from 'vscode-test-adapter-api';
import {BanditTestAdapter} from './adapter';

export async function activate(context: vscode.ExtensionContext) {
  const testExplorerExtension =
      vscode.extensions.getExtension<TestExplorerExtension>(
          testExplorerExtensionId);

  if (testExplorerExtension) {
    if (!testExplorerExtension.isActive) {
      await testExplorerExtension.activate();
    }

    const registeredAdapters =
        new Map<vscode.WorkspaceFolder, BanditTestAdapter>();

    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const adapter = new BanditTestAdapter(workspaceFolder);
        registeredAdapters.set(workspaceFolder, adapter);
        testExplorerExtension.exports.registerAdapter(adapter);
      }
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {

          for (const workspaceFolder of event.removed) {
            const adapter = registeredAdapters.get(workspaceFolder);
            if (adapter) {
              testExplorerExtension.exports.unregisterAdapter(adapter);
              registeredAdapters.delete(workspaceFolder);
            }
          }

          for (const workspaceFolder of event.added) {
            const adapter = new BanditTestAdapter(workspaceFolder);
            registeredAdapters.set(workspaceFolder, adapter);
            testExplorerExtension.exports.registerAdapter(adapter);
          }
        }));
  }
}
