import * as vscode from "vscode";
import * as path from "path";
import { StructureNode } from "../types";
import { getFileIndex } from "../indexing/fileIndex";
import { Area, buildStructure } from "./buildStructure";

/** Builds the project map for every workspace folder from the file index. */
export function buildStructurePayload(): StructureNode[] {
  const index = getFileIndex();

  return (vscode.workspace.workspaceFolders ?? []).map((folder) => {
    const prefix = folder.uri.fsPath + path.sep;
    const files = index
      .filter((u) => u.fsPath.startsWith(prefix))
      .map((u) => u.fsPath.slice(prefix.length));
    return toPayload(buildStructure(folder.name, files), folder.uri);
  });
}

function toPayload(area: Area, folderUri: vscode.Uri): StructureNode {
  const uri = area.path === "" ? folderUri : vscode.Uri.joinPath(folderUri, area.path);
  return {
    name: area.name,
    path: vscode.workspace.asRelativePath(uri),
    uri: uri.toString(),
    kind: area.kind,
    fileCount: area.fileCount,
    languages: area.languages,
    keyFiles: area.keyFiles.map((key) => {
      const keyUri = vscode.Uri.joinPath(folderUri, key.path);
      return {
        name: path.posix.basename(key.path),
        path: vscode.workspace.asRelativePath(keyUri),
        uri: keyUri.toString(),
        role: key.role,
      };
    }),
    children: area.children.map((child) => toPayload(child, folderUri)),
  };
}
