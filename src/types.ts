import * as vscode from "vscode";
import type { AreaKind, KeyFileRole } from "./structure/buildStructure";

/** QuickPick item that carries the resolved URI alongside VS Code's standard fields. */
export type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };

/** Lightweight payload sent over the webview message bus (JSON-serialisable). */
export interface FileItemPayload {
  label: string;
  path: string;
  uri: string;
}

/**
 * A node in the Explorer Plus folder browser (directories only).
 * Used to build the picker tree the user navigates before selecting focus folders.
 */
export interface DirNode {
  name: string;
  path: string;      // Relative path from workspace root (for display)
  uri: string;       // Full folder URI string
  children: DirNode[];
}

/** A node in the Explorer Plus file tree (both files and directories). */
export interface TreeNode {
  name: string;
  path: string;          // Relative path from workspace root
  uri: string;           // Full URI (file:// for both files and dirs)
  type: "file" | "dir";
  children?: TreeNode[]; // Only present for directories
}

/** An area in the Structure view's project map. */
export interface StructureNode {
  name: string;
  path: string;          // Relative path from workspace root (for display)
  uri: string;           // Full folder URI
  kind: AreaKind;
  fileCount: number;
  languages: string[];   // Most common file extensions first
  keyFiles: { name: string; path: string; uri: string; role: KeyFileRole }[];
  children: StructureNode[];
}

/** Which Navify view a webview instance renders. */
export type ViewKind = "search" | "structure" | "explorer";

// ── Inbound (webview → extension) ────────────────────────────────────────────

export type InboundMessage =
  | { type: "READY" }
  | { type: "SEARCH"; q: string }
  | { type: "OPEN"; uri: string }
  | { type: "EXPLORER_GET_DIR_TREE" }
  | { type: "EXPLORER_GET_TREE"; folderUris: string[] }
  | { type: "EXPLORER_MODE"; mode: "pick" | "tree" }
  | { type: "STRUCTURE_GET" }
  | { type: "FOCUS_IN_EXPLORER"; uri: string };

// ── Outbound (extension → webview) ───────────────────────────────────────────

export type OutboundMessage =
  | { type: "RESULTS"; q: string; items: FileItemPayload[] }
  | { type: "RECENT_FILES"; items: FileItemPayload[] }
  | { type: "EXPLORER_DIR_TREE"; roots: DirNode[] }
  | { type: "EXPLORER_TREE"; roots: TreeNode[] }
  | { type: "EXPLORER_CHANGE_FOLDERS" }
  | { type: "EXPLORER_FOCUS"; folderUris: string[] }
  | { type: "STRUCTURE"; roots: StructureNode[] }
  | { type: "ACTIVE_FILE"; uri: string | null };
