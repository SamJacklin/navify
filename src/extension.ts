import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };

let fileIndex: vscode.Uri[] = [];
const previewCache = new Map<string, string>(); // key: uri.toString()

export async function activate(context: vscode.ExtensionContext) {
  // Build file index in the background; don't block activation.
  buildFileIndex().catch(err => console.error('[Navify] index error:', err));

  const disposable = vscode.commands.registerCommand('navify.searchFiles', async () => {
    if (vscode.workspace.workspaceFolders?.length === 0) {
      vscode.window.showInformationMessage('Open a folder or workspace to use Navify.');
      return;
    }
    // Ensure we have *some* index. If still building, do a quick, small scan as fallback.
    if (fileIndex.length === 0) {
      await buildFileIndex({ fast: true }).catch(() => {});
    }

    await showFuzzyFilePicker();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // no-op
}

/**
 * Builds the file index, respecting common excludes.
 * When fast=true, scans fewer files to avoid initial delay.
 */
async function buildFileIndex(opts?: { fast?: boolean }) {
  const fast = opts?.fast ?? false;

  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  if (wsFolders.length === 0) return;

  // Gather exclude globs from settings
  const cfg = vscode.workspace.getConfiguration();
  const filesExclude = cfg.get<Record<string, boolean>>('files.exclude') ?? {};
  const searchExclude = cfg.get<Record<string, boolean>>('search.exclude') ?? {};
  const defaultExcludes = [
    '**/.git/**',
    '**/node_modules/**',
    '**/.vscode/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/.cache/**',
  ];

  const mergedExcludes = new Set<string>(defaultExcludes);
  for (const [glob, ignored] of Object.entries(filesExclude)) {
    if (ignored) mergedExcludes.add(glob);
  }
  for (const [glob, ignored] of Object.entries(searchExclude)) {
    if (ignored) mergedExcludes.add(glob);
  }

  // Use findFiles with include '**/*' and our merged excludes.
  // Note: VS Code supports passing a single exclude pattern; we can OR them by joining with commas via `{}`.
  const excludePattern =
    mergedExcludes.size > 0
      ? `{${Array.from(mergedExcludes).join(',')}}`
      : '';

  // Limit result count in "fast" mode to keep activation snappy.
  const maxResults = fast ? 5000 : 100000;

  const uris = await vscode.workspace.findFiles('**/*', excludePattern, maxResults);
  fileIndex = uris;
}

/**
 * Shows a QuickPick that filters by filename/path and displays preview lines
 * for the actively highlighted item.
 */
async function showFuzzyFilePicker() {
  // Map current index to QuickPick items
  const items: FileItem[] = fileIndex.map(uri => toQuickPickItem(uri));

  const qp = vscode.window.createQuickPick<FileItem>();
  qp.matchOnDescription = true; // include parent folder in matching
  qp.matchOnDetail = true;      // allow preview text to be matched (once loaded)
  qp.placeholder = 'Type to fuzzy-search files… (↑/↓ to preview, Enter to open)';
  qp.items = items;

  const disposables: vscode.Disposable[] = [];

  // Load preview when user moves the highlight (active item changes)
  disposables.push(qp.onDidChangeActive(async (active) => {
    if (!active || active.length === 0) return;
    const item = active[0];
    await ensurePreviewForItem(item);
    // Reassign items to refresh UI with updated detail (QuickPick renders immutably)
    // Only refresh the one that changed to avoid flicker.
    qp.items = qp.items.map(i => (i.uri.toString() === item.uri.toString() ? item : i));
  }));

  // Open file when user accepts selection
  disposables.push(qp.onDidAccept(async () => {
    const [sel] = qp.selectedItems;
    if (!sel) return;
    qp.hide();
    try {
      await vscode.window.showTextDocument(sel.uri, { preview: true });
    } catch (err) {
      vscode.window.showErrorMessage(`Could not open file: ${sel.label}`);
    }
  }));

  // Re-index trigger if user types a scope-like pattern the index might be missing.
  // (Nice-to-have heuristic: if user typed a dot-ext filter and we have 0 shown items.)
  disposables.push(qp.onDidChangeValue(async (val) => {
    if (!val || qp.items.length > 0) return;
    // If empty result, try a quick re-scan (fast) once.
    await buildFileIndex({ fast: true }).catch(() => {});
    qp.items = fileIndex.map(uri => toQuickPickItem(uri));
  }));

  disposables.push(qp.onDidHide(() => disposables.forEach(d => d.dispose())));
  qp.show();
}

/** Convert a Uri to a QuickPick item with filename label and folder path description. */
function toQuickPickItem(uri: vscode.Uri): FileItem {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  const workspaceRoot = wsFolder?.uri.fsPath ?? '';
  const rel = workspaceRoot ? path.relative(workspaceRoot, uri.fsPath) : uri.fsPath;

  const label = path.basename(rel);
  const description = path.dirname(rel) === '.' ? '' : path.dirname(rel);

  const item: FileItem = {
    label,
    description,
    // detail will be filled lazily on highlight
    detail: '',
    uri
  };
  return item;
}

/**
 * Ensure the QuickPickItem has a preview (detail) filled in.
 * Reads a small chunk from disk and extracts the first 2–3 non-empty lines.
 */
async function ensurePreviewForItem(item: FileItem) {
  const key = item.uri.toString();
  if (previewCache.has(key)) {
    item.detail = previewCache.get(key) ?? '';
    return;
  }
  try {
    const buf = await readHead(item.uri, 4096); // read first 4KB only
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);

    const previewLines: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length === 0) continue;
      // Skip super noisy lines like long import maps, minified, or binaryy
      if (line.length > 200) continue;
      previewLines.push(line);
      if (previewLines.length >= 3) break;
    }

    const preview = previewLines.length > 0
      ? previewLines.join('\n')
      : '— (no preview)';

    item.detail = preview;
    previewCache.set(key, preview);
  } catch {
    const fallback = '— (preview unavailable)';
    item.detail = fallback;
    previewCache.set(key, fallback);
  }
}

/** Read the first N bytes of a file safely. */
async function readHead(uri: vscode.Uri, bytes: number): Promise<Buffer> {
  // Only supports file scheme
  if (uri.scheme !== 'file') {
    // For virtual documents (zipfs, etc.), skip preview
    return Buffer.from('');
  }
  const handle = await fs.open(uri.fsPath, 'r');
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
