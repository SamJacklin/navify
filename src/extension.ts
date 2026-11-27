import * as vscode from "vscode";
import {
  buildFileIndex,
  getFileIndex,
  onDidChangeFileIndex,
  watchFileIndex,
} from "./indexing/fileIndex";
import { RecentFilesTracker } from "./recentFiles/RecentFilesTracker";
import { NavifyViewProvider } from "./webview/NavifyViewProvider";
import { showFuzzyFilePicker } from "./quickpick/showFuzzyFilePicker";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  buildFileIndex().catch((err) => console.error("[Navify] index error:", err));
  context.subscriptions.push(watchFileIndex());

  const recentFiles = new RecentFilesTracker();
  const searchView = new NavifyViewProvider(context, recentFiles, "search");
  const structureView = new NavifyViewProvider(context, recentFiles, "structure");
  const explorerView = new NavifyViewProvider(context, recentFiles, "explorer");
  const views = [searchView, structureView, explorerView];

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("navify.searchView", searchView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("navify.structureView", structureView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("navify.explorerView", explorerView, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(onDidChangeFileIndex(() => structureView.sendStructure()));

  // Track recently opened files from editor focus only. `onDidOpenTextDocument`
  // also fires when extensions load documents in the background (hovers, peek,
  // language servers), which filled the list with files the user never opened.
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

  // Keep recent files pointing at files that exist. The watcher catches
  // deletions from anywhere (including git); renames made inside VS Code are
  // followed rather than dropped.
  const deleteWatcher = vscode.workspace.createFileSystemWatcher("**/*", true, true, false);
  context.subscriptions.push(
    deleteWatcher,
    deleteWatcher.onDidDelete((uri) => {
      recentFiles.remove(uri);
      views.forEach((view) => view.sendRecentFiles());
    }),
    vscode.workspace.onDidRenameFiles((e) => {
      e.files.forEach(({ oldUri, newUri }) => recentFiles.rename(oldUri, newUri));
      views.forEach((view) => view.sendRecentFiles());
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
    }),
    vscode.commands.registerCommand("navify.explorer.focusFolder", async (uri: unknown) => {
      if (typeof uri !== "string") {
        return;
      }
      await vscode.commands.executeCommand("navify.explorerView.focus");
      explorerView.focusFolders([uri]);
    })
  );
}

export function deactivate(): void {
  // no-op
}
