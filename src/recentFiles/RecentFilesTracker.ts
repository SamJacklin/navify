import * as vscode from "vscode";
import * as path from "path";
import { FileItemPayload } from "../types";

const MAX_RECENT_FILES = 20;

/**
 * Tracks recently opened workspace files, newest-first.
 * Keeps state encapsulated so it can be injected into whoever needs it.
 */
export class RecentFilesTracker {
  private files: vscode.Uri[] = [];

  /**
   * Record a file as recently opened.
   * No-ops for non-`file://` URIs and files outside the workspace.
   */
  add(uri: vscode.Uri): void {
    if (uri.scheme !== "file") {
      return;
    }
    if (!vscode.workspace.getWorkspaceFolder(uri)) {
      return;
    }

    // Dedupe: remove existing entry, then prepend
    const key = uri.toString();
    this.files = this.files.filter((u) => u.toString() !== key);
    this.files.unshift(uri);

    if (this.files.length > MAX_RECENT_FILES) {
      this.files = this.files.slice(0, MAX_RECENT_FILES);
    }
  }

  /** Serialise to the JSON-safe shape expected by the webview. */
  toPayload(): FileItemPayload[] {
    return this.files.map((u) => ({
      label: path.basename(u.fsPath),
      path: vscode.workspace.asRelativePath(u),
      uri: u.toString(),
    }));
  }
}
