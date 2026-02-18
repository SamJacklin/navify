import * as vscode from "vscode";

/** QuickPick item that carries the resolved URI alongside VS Code's standard fields. */
export type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };

/** Lightweight payload sent over the webview message bus (JSON-serialisable). */
export interface FileItemPayload {
  label: string;
  path: string;
  uri: string;
}

// ── Inbound (webview → extension) ────────────────────────────────────────────

export type InboundMessage =
  | { type: "SEARCH"; q: string }
  | { type: "OPEN"; uri: string };

// ── Outbound (extension → webview) ───────────────────────────────────────────

export type OutboundMessage =
  | { type: "RESULTS"; items: FileItemPayload[] }
  | { type: "RECENT_FILES"; items: FileItemPayload[] };
