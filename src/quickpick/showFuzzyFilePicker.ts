import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { FileItem } from "../types";
import { getFileIndex, buildFileIndex } from "../indexing/fileIndex";

// Keyed by uri.toString(); survives across QuickPick sessions for the lifetime
// of the extension host.
const previewCache = new Map<string, string>();

export async function showFuzzyFilePicker(): Promise<void> {
  const items: FileItem[] = getFileIndex().map(toQuickPickItem);

  const qp = vscode.window.createQuickPick<FileItem>();
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.placeholder = "Type to fuzzy-search files… (↑/↓ to preview, Enter to open)";
  qp.items = items;

  const disposables: vscode.Disposable[] = [];

  disposables.push(
    qp.onDidChangeActive(async (active) => {
      if (!active || active.length === 0) {
        return;
      }
      const item = active[0];
      await ensurePreviewForItem(item);
      qp.items = qp.items.map((i) =>
        i.uri.toString() === item.uri.toString() ? item : i
      );
    })
  );

  disposables.push(
    qp.onDidAccept(async () => {
      const [sel] = qp.selectedItems;
      if (!sel) {
        return;
      }
      qp.hide();
      try {
        await vscode.window.showTextDocument(sel.uri, { preview: true });
      } catch {
        vscode.window.showErrorMessage(`Could not open file: ${sel.label}`);
      }
    })
  );

  disposables.push(
    qp.onDidChangeValue(async (val) => {
      if (!val || qp.items.length > 0) {
        return;
      }
      try {
        await buildFileIndex({ fast: true });
      } catch {
        // ignore
      }
      qp.items = getFileIndex().map(toQuickPickItem);
    })
  );

  disposables.push(qp.onDidHide(() => disposables.forEach((d) => d.dispose())));
  qp.show();
}

function toQuickPickItem(uri: vscode.Uri): FileItem {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  const workspaceRoot = wsFolder?.uri.fsPath ?? "";
  const rel = workspaceRoot ? path.relative(workspaceRoot, uri.fsPath) : uri.fsPath;
  const label = path.basename(rel);
  const description = path.dirname(rel) === "." ? "" : path.dirname(rel);
  return { label, description, detail: "", uri };
}

async function ensurePreviewForItem(item: FileItem): Promise<void> {
  const key = item.uri.toString();
  if (previewCache.has(key)) {
    item.detail = previewCache.get(key) ?? "";
    return;
  }
  try {
    const buf = await readHead(item.uri, 4096);
    const text = buf.toString("utf8");
    const lines = text.split(/\r?\n/);

    const previewLines: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.length > 200) {
        continue;
      }
      previewLines.push(line);
      if (previewLines.length >= 3) {
        break;
      }
    }

    const preview = previewLines.length ? previewLines.join("\n") : "— (no preview)";
    item.detail = preview;
    previewCache.set(key, preview);
  } catch {
    const fallback = "— (preview unavailable)";
    item.detail = fallback;
    previewCache.set(key, fallback);
  }
}

async function readHead(uri: vscode.Uri, bytes: number): Promise<Buffer> {
  if (uri.scheme !== "file") {
    return Buffer.from("");
  }
  const handle = await fs.open(uri.fsPath, "r");
  try {
    const { size } = await handle.stat();
    const len = Math.min(bytes, size);
    const buf = Buffer.alloc(len);
    await handle.read(buf, 0, len, 0);
    return buf;
  } finally {
    await handle.close();
  }
}
