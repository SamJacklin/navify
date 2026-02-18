import * as vscode from "vscode";
import * as path from "path";
import { OutboundMessage } from "../types";
import { getFileIndex } from "../indexing/fileIndex";
import { isJunkPath } from "../indexing/isJunkPath";
import { RecentFilesTracker } from "../recentFiles/RecentFilesTracker";
import { getHtml } from "./html";

export class NavifySearchViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly recentFiles: RecentFilesTracker
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    const { webview } = webviewView;
    this.webview = webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };

    webview.html = await getHtml(webview, this.ctx.extensionUri);

    // Push current recent files as soon as the view is ready.
    this.sendRecentFiles();

    webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as { type?: string; q?: string; uri?: string } | null;

      if (msg?.type === "SEARCH") {
        const cfg = vscode.workspace.getConfiguration("navify");
        const hideHidden = cfg.get<boolean>("hideHiddenFiles", true);
        const q = String(msg.q ?? "")
          .toLowerCase()
          .trim();

        const items = !q
          ? []
          : getFileIndex()
              .filter((u) => {
                const p = u.fsPath.toLowerCase();
                return p.includes(q) || path.basename(p).includes(q);
              })
              .filter((u) => !isJunkPath(u.fsPath, hideHidden))
              .slice(0, 300)
              .map((u) => ({
                label: path.basename(u.fsPath),
                path: vscode.workspace.asRelativePath(u),
                uri: u.toString(),
              }));

        const response: OutboundMessage = { type: "RESULTS", items };
        webview.postMessage(response);
        return;
      }

      if (msg?.type === "OPEN" && msg.uri) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.parse(msg.uri), {
            preview: true,
          });
        } catch {
          vscode.window.showErrorMessage("Could not open file.");
        }
      }
    });
  }

  sendRecentFiles(): void {
    if (!this.webview) {
      return;
    }
    const message: OutboundMessage = {
      type: "RECENT_FILES",
      items: this.recentFiles.toPayload(),
    };
    this.webview.postMessage(message);
  }
}
