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
  // Details hold file previews, which only exist for items that have been
  // highlighted; matching on them made results depend on browsing history.
  qp.matchOnDetail = false;
  qp.placeholder = "Type to fuzzy-search files… (↑/↓ to preview, Enter to open)";
  qp.items = items;

  const disposables: vscode.Disposable[] = [];

  disposables.push(
    qp.onDidChangeActive(async ([item]) => {
      // Skip items that already show a preview. This also stops the
      // activeItems assignment below from re-entering this handler forever.
      if (!item || item.detail) {
        return;
      }
      await ensurePreviewForItem(item);
      if (qp.activeItems[0] !== item) {
        return; // user has moved on; the preview shows next time it renders
      }
      // QuickPick only re-renders a mutated item when `items` is reassigned,
      // and reassigning resets the active item to the top of the list. Keep
      // the scroll position and restore the active item so ↑/↓ isn't undone.
      qp.keepScrollPosition = true;
      qp.items = [...qp.items];
      qp.activeItems = [item];
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
    if (buf.includes(0)) {
      // A NUL byte means binary content; decoding it would show garbage.
      item.detail = "— (binary file)";
      previewCache.set(key, item.detail);
      return;
    }
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
