import * as vscode from "vscode";
import { buildFileIndex, getFileIndex } from "./indexing/fileIndex";
import { RecentFilesTracker } from "./recentFiles/RecentFilesTracker";
import { NavifyViewProvider } from "./webview/NavifyViewProvider";
import { showFuzzyFilePicker } from "./quickpick/showFuzzyFilePicker";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  buildFileIndex().catch((err) => console.error("[Navify] index error:", err));

  const recentFiles = new RecentFilesTracker();
  const searchView = new NavifyViewProvider(context, recentFiles, "search");
  const explorerView = new NavifyViewProvider(context, recentFiles, "explorer");
  const views = [searchView, explorerView];

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("navify.searchView", searchView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("navify.explorerView", explorerView, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Track recently opened files via both editor focus and document open events.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri) {
        recentFiles.add(editor.document.uri);
      }
      for (const view of views) {
        if (editor?.document.uri) {
          view.sendRecentFiles();
        }
        // Always notify — null when no editor is active.
        view.sendActiveFile();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.uri) {
        recentFiles.add(doc.uri);
        views.forEach((view) => view.sendRecentFiles());
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

  context.subscriptions.push(
    vscode.commands.registerCommand("navify.explorer.changeFolders", () => {
      explorerView.post({ type: "EXPLORER_CHANGE_FOLDERS" });
    })
  );
}

export function deactivate(): void {
  // no-op
}
