import * as vscode from "vscode";
import { buildFileIndex, getFileIndex } from "./indexing/fileIndex";
import { RecentFilesTracker } from "./recentFiles/RecentFilesTracker";
import { NavifySearchViewProvider } from "./webview/NavifySearchViewProvider";
import { showFuzzyFilePicker } from "./quickpick/showFuzzyFilePicker";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  buildFileIndex().catch((err) => console.error("[Navify] index error:", err));

  const recentFiles = new RecentFilesTracker();
  const provider = new NavifySearchViewProvider(context, recentFiles);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("navify.searchView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Track recently opened files via both editor focus and document open events.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri) {
        recentFiles.add(editor.document.uri);
        provider.sendRecentFiles();
      }
      // Always notify — null when no editor is active.
      provider.sendActiveFile();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.uri) {
        recentFiles.add(doc.uri);
        provider.sendRecentFiles();
      }
    })
  );

  // Seed with the file that is already open when the extension activates.
  if (vscode.window.activeTextEditor?.document.uri) {
    recentFiles.add(vscode.window.activeTextEditor.document.uri);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("navify.searchFiles", async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showInformationMessage(
          "Open a folder or workspace to use Navify."
        );
        return;
      }
      if (getFileIndex().length === 0) {
        try {
          await buildFileIndex({ fast: true });
        } catch {
          // ignore — QuickPick will open with whatever is available
        }
      }
      await showFuzzyFilePicker();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("navify.focus", async () => {
      await vscode.commands.executeCommand(
        "workbench.view.extension.navify-container"
      );
      await vscode.commands.executeCommand("navify.searchView.focus");
    })
  );
}

export function deactivate(): void {
  // no-op
}
