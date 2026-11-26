import * as vscode from "vscode";
import * as path from "path";
import { FileItemPayload } from "../types";

const MAX_RECENT_FILES = 20;
const STORAGE_KEY = "navify.recentFiles";

/**
 * Tracks recently opened workspace files, newest-first, and keeps them in
 * workspace storage so the list survives a reload.
 */
export class RecentFilesTracker {
  private files: vscode.Uri[];

  constructor(private readonly storage: vscode.Memento) {
    const stored: unknown = storage.get(STORAGE_KEY);
    this.files = Array.isArray(stored)
      ? stored
          .filter((s): s is string => typeof s === "string")
          .map((s) => vscode.Uri.parse(s))
          .filter((u) => vscode.workspace.getWorkspaceFolder(u))
      : [];
  }

  /**
   * Drops stored files that were deleted or moved while VS Code was closed.
   * Returns whether anything was removed.
   */
  async pruneMissing(): Promise<boolean> {
    const checked = [...this.files];
    const exists = await Promise.all(
      checked.map((u) =>
        vscode.workspace.fs.stat(u).then(
          () => true,
          () => false
        )
      )
    );
    const missing = new Set(checked.filter((_, i) => !exists[i]).map((u) => u.toString()));
    if (missing.size === 0) {
      return false;
    }
    // Filter the current list, not the checked copy: files may have been
    // opened while the checks ran.
    this.files = this.files.filter((u) => !missing.has(u.toString()));
    this.save();
    return true;
  }

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
    this.save();
  }

  /**
   * Drop a deleted file, or every file under a deleted folder.
   * Returns whether anything was removed.
   */
  remove(uri: vscode.Uri): boolean {
    const kept = this.files.filter((u) => !isSameOrInside(u, uri));
    if (kept.length === this.files.length) {
      return false;
    }
    this.files = kept;
    this.save();
    return true;
  }

  /** Follow a rename or move of a file, or of a folder containing files. */
  rename(oldUri: vscode.Uri, newUri: vscode.Uri): void {
    const oldPath = oldUri.toString();
    this.files = this.files.map((u) =>
      isSameOrInside(u, oldUri)
        ? vscode.Uri.parse(newUri.toString() + u.toString().slice(oldPath.length))
        : u
    );
    this.save();
  }

  private save(): void {
    this.storage
      .update(
        STORAGE_KEY,
        this.files.map((u) => u.toString())
      )
      .then(undefined, (err) => console.error("[Navify] could not save recent files:", err));
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
