import * as vscode from "vscode";
import { buildExcludePattern } from "./excludes";
import { isJunkPath } from "./isJunkPath";

let fileIndex: vscode.Uri[] = [];

export function getFileIndex(): vscode.Uri[] {
  return fileIndex;
}

export async function buildFileIndex(opts?: { fast?: boolean }): Promise<void> {
  const fast = opts?.fast ?? false;
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  if (wsFolders.length === 0) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("navify");
  const maxResultsCfg = cfg.get<number>("maxResults", 100000);
  const hideHidden = cfg.get<boolean>("hideHiddenFiles", true);

  const excludePattern = buildExcludePattern();
  const maxResults = fast ? Math.min(5000, maxResultsCfg) : maxResultsCfg;

  const uris = await vscode.workspace.findFiles("**/*", excludePattern, maxResults);
  fileIndex = uris.filter((u) => u.scheme === "file" && !isJunkPath(u.fsPath, hideHidden));
}
