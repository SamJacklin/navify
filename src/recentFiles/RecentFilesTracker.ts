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

  /** Drop a deleted file, or every file under a deleted folder. */
  remove(uri: vscode.Uri): void {
    this.files = this.files.filter((u) => !isSameOrInside(u, uri));
  }

  /** Follow a rename or move of a file, or of a folder containing files. */
  rename(oldUri: vscode.Uri, newUri: vscode.Uri): void {
    const oldPath = oldUri.toString();
    this.files = this.files.map((u) =>
      isSameOrInside(u, oldUri)
        ? vscode.Uri.parse(newUri.toString() + u.toString().slice(oldPath.length))
        : u
    );
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

function isSameOrInside(uri: vscode.Uri, target: vscode.Uri): boolean {
  const u = uri.toString();
  const t = target.toString();
  return u === t || u.startsWith(t.endsWith("/") ? t : t + "/");
}
