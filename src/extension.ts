import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };

let fileIndex: vscode.Uri[] = [];
const previewCache = new Map<string, string>(); // key: uri.toString()

export async function activate(context: vscode.ExtensionContext) {
  // Build file index in the background; don't block activation.
  buildFileIndex().catch(err => console.error('[Navify] index error:', err));

  // register the sidebar/webview provider 
  const provider = new NavifySearchViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('navify.searchView', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Keep your QuickPick command
  context.subscriptions.push(
    vscode.commands.registerCommand('navify.searchFiles', async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showInformationMessage('Open a folder or workspace to use Navify.');
        return;
      }
      if (fileIndex.length === 0) {
        await buildFileIndex({ fast: true }).catch(() => {});
      }
      await showFuzzyFilePicker();
    })
  );

  // Handy: a command to focus your view
  context.subscriptions.push(
    vscode.commands.registerCommand('navify.focus', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.navify-container');
      await vscode.commands.executeCommand('navify.searchView.focus');
    })
  );
}

export function deactivate() {
  // no-op
}

/* ---------------- Sidebar (Webview View) ---------------- */

class NavifySearchViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.ctx.extensionUri]
    };
    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === 'SEARCH') {
        const cfg = vscode.workspace.getConfiguration('navify');
        const hideHidden = cfg.get<boolean>('hideHiddenFiles', true);
        const q = String(msg.q || '').toLowerCase().trim();
        const items = !q
          ? []
          : fileIndex
              .filter(u => {
                const p = u.fsPath.toLowerCase();
                return p.includes(q) || path.basename(p).includes(q);
              }).filter(u => !isJunkPath(u.fsPath, hideHidden))
              .slice(0, 300)
              .map(u => ({
                label: path.basename(u.fsPath),
                path: vscode.workspace.asRelativePath(u),
                uri: u.toString()
              }));
        webview.postMessage({ type: 'RESULTS', items });
      } else if (msg?.type === 'OPEN' && msg.uri) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.parse(msg.uri), { preview: true });
        } catch {
          vscode.window.showErrorMessage('Could not open file.');
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    // Use your PNG for now; SVG tints better but PNG is fine
    const logo = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'logo.png')
    );
    const nonce = getNonce();
    const csp = [
      "default-src 'none';",
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `script-src 'nonce-${nonce}';`
    ].join(' ');

    return /* html */ `
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Navify</title>
  <style>
    :root{
      --fg: var(--vscode-foreground);
      --bg: var(--vscode-sideBar-background);
      --border: var(--vscode-dropdown-border);
      --inputBg: var(--vscode-input-background);
      --inputFg: var(--vscode-input-foreground);
      --accent: var(--vscode-focusBorder);
    }
    html,body{height:100%}
    body{margin:0;font-family:var(--vscode-font-family);color:var(--fg);background:var(--bg)}
    .header{
      position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;
      padding:10px;border-bottom:1px solid var(--border);background:var(--bg)
    }
    .logo{width:18px;height:18px;opacity:.9}
    .search{
      flex:1;display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);
      border-radius:4px;background:var(--inputBg);color:var(--inputFg)
    }
    .search input{
      flex:1;border:none;outline:none;background:transparent;color:inherit
    }
    .results{padding:8px}
    .item{padding:6px 8px;border-radius:4px;cursor:pointer}
    .item:hover{background:rgba(127,127,127,.15)}
    .label{font-weight:600}
    .path{opacity:.8;font-size:12px}
    .empty{padding:16px;opacity:.7}
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="${logo}" alt="Navify">
    <div class="search">
      <input id="q" placeholder="Search files… (like Find)" aria-label="Search files" />
    </div>
  </div>
  <div id="results" class="results">
    <div class="empty">Type to search your workspace.</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const q = document.getElementById('q');
    const results = document.getElementById('results');

    let t;
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        vscode.postMessage({ type: 'SEARCH', q: q.value });
      }, 120);
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg?.type === 'RESULTS') {
        const items = msg.items || [];
        if (!items.length) {
          results.innerHTML = '<div class="empty">No matches.</div>';
          return;
        }
        results.innerHTML = items.map(i => (
          '<div class="item" data-uri="' + i.uri + '">' +
            '<div class="label">' + esc(i.label) + '</div>' +
            '<div class="path">' + esc(i.path) + '</div>' +
          '</div>'
        )).join('');
        for (const el of results.querySelectorAll('.item')) {
          el.addEventListener('click', () => {
            vscode.postMessage({ type: 'OPEN', uri: el.getAttribute('data-uri') });
          });
        }
      }
    });

    function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
    q.focus();
  </script>
</body>
</html>`;
  }
}

async function buildFileIndex(opts?: { fast?: boolean }) {
  const fast = opts?.fast ?? false;
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  if (wsFolders.length === 0) return;

  const cfg = vscode.workspace.getConfiguration();
  const respect = cfg.get<boolean>('navify.respectWorkspaceExcludes', true);
  const userExtra = cfg.get<string[]>('navify.excludeGlobs', []);
  const maxResultsCfg = cfg.get<number>('navify.maxResults', 100000);

  const defaultExcludes = new Set<string>([
    // VCS / IDE
    '**/.git/**','**/.hg/**','**/.svn/**','**/.vscode/**','**/.idea/**','**/.vs/**','**/.DS_Store',
    // Node / front-end build junk
    '**/node_modules/**','**/bower_components/**','**/.cache/**','**/.turbo/**','**/.next/**','**/.parcel-cache/**','**/.rollup.cache/**',
    '**/dist/**','**/build/**','**/out/**','**/coverage/**','**/*.map',
    // Java / .NET / Rust / Terraform
    '**/target/**','**/bin/**','**/obj/**','**/.gradle/**','**/.cargo/**','**/.terraform/**',
    // Python
    '**/.venv/**','**/venv/**','**/__pycache__/**','**/*.pyc','**/.mypy_cache/**','**/.pytest_cache/**',
    // Logs & temps
    '**/*.log','**/*.tmp','**/*.bak'
  ]);

  // Merge workspace excludes if enabled
  if (respect) {
    const filesExclude = cfg.get<Record<string, boolean>>('files.exclude') ?? {};
    const searchExclude = cfg.get<Record<string, boolean>>('search.exclude') ?? {};
    for (const [glob, ignored] of Object.entries(filesExclude)) if (ignored) defaultExcludes.add(glob);
    for (const [glob, ignored] of Object.entries(searchExclude)) if (ignored) defaultExcludes.add(glob);
  }

  // Merge user-configured extra globs
  for (const glob of userExtra) defaultExcludes.add(glob);

  const excludePattern = defaultExcludes.size ? `{${Array.from(defaultExcludes).join(',')}}` : '';
  const maxResults = fast ? Math.min(5000, maxResultsCfg) : maxResultsCfg;

  const uris = await vscode.workspace.findFiles('**/*', excludePattern, maxResults);
  const hideHidden = vscode.workspace.getConfiguration().get<boolean>('navify.hideHiddenFiles', true);
  fileIndex = uris.filter(u => u.scheme === 'file' && !isJunkPath(u.fsPath, hideHidden));
}

function isJunkPath(fsPath: string, hideHidden: boolean): boolean {
  const p = fsPath.replace(/\\/g, '/').toLowerCase();

  // quick directory substrings (fast path)
  const dirBadges = [
    '/.git/','/.hg/','/.svn/','/node_modules/','/.vscode/','/.idea/','/.vs/','/.cache/','/.turbo/','/.next/',
    '/dist/','/build/','/out/','/coverage/','/target/','/bin/','/obj/','/.gradle/','/.cargo/','/.terraform/',
    '/.venv/','/venv/','/__pycache__/','/.mypy_cache/','/.pytest_cache/','/.parcel-cache/','/.rollup.cache/'
  ];
  if (dirBadges.some(tag => p.includes(tag))) return true;

  // extensions
  if (p.endsWith('.pyc') || p.endsWith('.log') || p.endsWith('.tmp') || p.endsWith('.bak') || p.endsWith('.map')) return true;

  // hide dotfiles/directories (configurable)
  if (hideHidden) {
    // any path segment starting with "."
    if (/(^|\/)\.[^\/]+/.test(p)) return true;
  }

  return false;
}


async function showFuzzyFilePicker() {
  const items: FileItem[] = fileIndex.map(uri => toQuickPickItem(uri));

  const qp = vscode.window.createQuickPick<FileItem>();
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.placeholder = 'Type to fuzzy-search files… (↑/↓ to preview, Enter to open)';
  qp.items = items;

  const disposables: vscode.Disposable[] = [];

  disposables.push(qp.onDidChangeActive(async (active) => {
    if (!active || active.length === 0) return;
    const item = active[0];
    await ensurePreviewForItem(item);
    qp.items = qp.items.map(i => (i.uri.toString() === item.uri.toString() ? item : i));
  }));

  disposables.push(qp.onDidAccept(async () => {
    const [sel] = qp.selectedItems;
    if (!sel) return;
    qp.hide();
    try { await vscode.window.showTextDocument(sel.uri, { preview: true }); }
    catch { vscode.window.showErrorMessage(`Could not open file: ${sel.label}`); }
  }));

  disposables.push(qp.onDidChangeValue(async (val) => {
    if (!val || qp.items.length > 0) return;
    await buildFileIndex({ fast: true }).catch(() => {});
    qp.items = fileIndex.map(uri => toQuickPickItem(uri));
  }));

  disposables.push(qp.onDidHide(() => disposables.forEach(d => d.dispose())));
  qp.show();
}

function toQuickPickItem(uri: vscode.Uri): FileItem {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  const workspaceRoot = wsFolder?.uri.fsPath ?? '';
  const rel = workspaceRoot ? path.relative(workspaceRoot, uri.fsPath) : uri.fsPath;
  const label = path.basename(rel);
  const description = path.dirname(rel) === '.' ? '' : path.dirname(rel);
  return { label, description, detail: '', uri };
}

async function ensurePreviewForItem(item: FileItem) {
  const key = item.uri.toString();
  if (previewCache.has(key)) { item.detail = previewCache.get(key) ?? ''; return; }
  try {
    const buf = await readHead(item.uri, 4096);
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    const previewLines: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.length > 200) continue;
      previewLines.push(line);
      if (previewLines.length >= 3) break;
    }
    const preview = previewLines.length ? previewLines.join('\n') : '— (no preview)';
    item.detail = preview;
    previewCache.set(key, preview);
  } catch {
    const fallback = '— (preview unavailable)';
    item.detail = fallback;
    previewCache.set(key, fallback);
  }
}

async function readHead(uri: vscode.Uri, bytes: number): Promise<Buffer> {
  if (uri.scheme !== 'file') return Buffer.from('');
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

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
