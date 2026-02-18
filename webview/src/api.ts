export type ResultItem = { label: string; path: string; uri: string };

/**
 * A node in the Explorer Plus folder browser (directories only).
 * Used to render the picker tree the user navigates before selecting.
 */
export interface DirNode {
  name: string;
  path: string;      // Relative path for display
  uri: string;       // Full folder URI
  children: DirNode[];
}

/** A node in the Explorer Plus file tree (files and directories). */
export interface TreeNode {
  name: string;
  path: string;
  uri: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

export type ToExtension =
  | { type: "SEARCH"; q: string }
  | { type: "OPEN"; uri: string }
  | { type: "EXPLORER_GET_DIR_TREE" }
  | { type: "EXPLORER_GET_TREE"; folderUris: string[] };

export type FromExtension =
  | { type: "RESULTS"; items: ResultItem[] }
  | { type: "RECENT_FILES"; items: ResultItem[] }
  | { type: "EXPLORER_DIR_TREE"; roots: DirNode[] }
  | { type: "EXPLORER_TREE"; roots: TreeNode[] };

const vscode = acquireVsCodeApi();

export function post(msg: ToExtension): void {
  vscode.postMessage(msg);
}

/** Registers a message handler and returns a cleanup function to remove it. */
export function onMessage(handler: (msg: FromExtension) => void): () => void {
  const listener = (e: MessageEvent) => handler(e.data as FromExtension);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
