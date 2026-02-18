export type ResultItem = { label: string; path: string; uri: string };

export type ToExtension =
  | { type: "SEARCH"; q: string }
  | { type: "OPEN"; uri: string };

export type FromExtension =
  | { type: "RESULTS"; items: ResultItem[] }
  | { type: "RECENT_FILES"; items: ResultItem[] };

const vscode = acquireVsCodeApi();

export function post(msg: ToExtension): void {
  vscode.postMessage(msg);
}

export function onMessage(handler: (msg: FromExtension) => void): void {
  window.addEventListener("message", (e) => handler(e.data));
}
