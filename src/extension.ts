import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

type FileItem = vscode.QuickPickItem & { uri: vscode.Uri };

let fileIndex: vscode.Uri[] = [];
const previewCache = new Map<string, string>(); // key: uri.toString()

export async function activate(context: vscode.ExtensionContext) {
  buildFileIndex().catch((err) => console.error("[Navify] index error:", err));

  const provider = new NavifySearchViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("navify.searchView", provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("navify.searchFiles", async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showInformationMessage("Open a folder or workspace to use Navify.");
        return;
      }
      if (fileIndex.length === 0) {
        try {
          await buildFileIndex({ fast: true });
        } catch {
          // ignore
        }
      }
      await showFuzzyFilePicker();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("navify.focus", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.navify-container");
      await vscode.commands.executeCommand("navify.searchView.focus");
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
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")]
    };

    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "SEARCH") {
        const cfg = vscode.workspace.getConfiguration("navify");
        const hideHidden = cfg.get<boolean>("hideHiddenFiles", true);

        const q = String(msg.q || "").toLowerCase().trim();
        const items =
          !q
            ? []
            : fileIndex
                .filter((u) => {
                  const p = u.fsPath.toLowerCase();
                  return p.includes(q) || path.basename(p).includes(q);
                })
                .filter((u) => !isJunkPath(u.fsPath, hideHidden))
                .slice(0, 300)
                .map((u) => ({
                  label: path.basename(u.fsPath),
                  path: vscode.workspace.asRelativePath(u),
                  uri: u.toString()
                }));

        webview.postMessage({ type: "RESULTS", items });
        return;
      }

      if (msg?.type === "OPEN" && msg.uri) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.parse(msg.uri), { preview: true });
        } catch {
          vscode.window.showErrorMessage("Could not open file.");
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, "media", "webview", "dist", "main.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, "media", "webview", "dist", "main.css")
    );

    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, "media", "logo.png")
    );

    const csp = [
      "default-src 'none';",
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource};`,
      `script-src 'nonce-${nonce}';`
    ].join(" ");

    return /* html */ `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="${styleUri}">
  <title>Navify</title>
</head>
<body>
  <div id="app"></div>

  <script nonce="${nonce}">
    window.__NAVIFY_LOGO__ = ${JSON.stringify(logoUri.toString())};
  </script>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/* ---------------- Indexing ---------------- */

async function buildFileIndex(opts?: { fast?: boolean }) {
  const fast = opts?.fast ?? false;
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  if (wsFolders.length === 0) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration();
  const respect = cfg.get<boolean>("navify.respectWorkspaceExcludes", true);
  const userExtra = cfg.get<string[]>("navify.excludeGlobs", []);
  const maxResultsCfg = cfg.get<number>("navify.maxResults", 100000);

  const defaultExcludes = new Set<string>([
    "**/.git/**",
    "**/.hg/**",
    "**/.svn/**",
    "**/.vscode/**",
    "**/.idea/**",
    "**/.vs/**",
    "**/.DS_Store",
    "**/node_modules/**",
    "**/bower_components/**",
    "**/.cache/**",
    "**/.turbo/**",
    "**/.next/**",
    "**/.parcel-cache/**",
    "**/.rollup.cache/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.map",
    "**/target/**",
    "**/bin/**",
    "**/obj/**",
    "**/.gradle/**",
    "**/.cargo/**",
    "**/.terraform/**",
    "**/.venv/**",
    "**/venv/**",
    "**/__pycache__/**",
    "**/*.pyc",
    "**/.mypy_cache/**",
    "**/.pytest_cache/**",
    "**/*.log",
    "**/*.tmp",
    "**/*.bak"
  ]);

  if (respect) {
    const filesExclude = cfg.get<Record<string, boolean>>("files.exclude") ?? {};
    const searchExclude = cfg.get<Record<string, boolean>>("search.exclude") ?? {};
    for (const [glob, ignored] of Object.entries(filesExclude)) {
      if (ignored) {
        defaultExcludes.add(glob);
      }
    }
    for (const [glob, ignored] of Object.entries(searchExclude)) {
      if (ignored) {
        defaultExcludes.add(glob);
      }
    }
  }

  for (const glob of userExtra) {
    defaultExcludes.add(glob);
  }

  const excludePattern = defaultExcludes.size ? `{${Array.from(defaultExcludes).join(",")}}` : "";
  const maxResults = fast ? Math.min(5000, maxResultsCfg) : maxResultsCfg;

  const uris = await vscode.workspace.findFiles("**/*", excludePattern, maxResults);
  const hideHidden = vscode.workspace.getConfiguration().get<boolean>("navify.hideHiddenFiles", true);

  fileIndex = uris.filter((u) => u.scheme === "file" && !isJunkPath(u.fsPath, hideHidden));
}

function isJunkPath(fsPath: string, hideHidden: boolean): boolean {
  const p = fsPath.replace(/\\/g, "/").toLowerCase();

  const dirBadges = [
    "/.git/",
    "/.hg/",
    "/.svn/",
    "/node_modules/",
    "/.vscode/",
    "/.idea/",
    "/.vs/",
    "/.cache/",
    "/.turbo/",
    "/.next/",
    "/dist/",
    "/build/",
    "/out/",
    "/coverage/",
    "/target/",
    "/bin/",
    "/obj/",
    "/.gradle/",
    "/.cargo/",
    "/.terraform/",
    "/.venv/",
    "/venv/",
    "/__pycache__/",
    "/.mypy_cache/",
    "/.pytest_cache/",
    "/.parcel-cache/",
    "/.rollup.cache/"
  ];

  if (dirBadges.some((tag) => p.includes(tag))) {
    return true;
  }

  if (
    p.endsWith(".pyc") ||
    p.endsWith(".log") ||
    p.endsWith(".tmp") ||
    p.endsWith(".bak") ||
    p.endsWith(".map")
  ) {
    return true;
  }

  if (hideHidden) {
    if (/(^|\/)\.[^\/]+/.test(p)) {
      return true;
    }
  }

  return false;
}

/* ---------------- QuickPick (unchanged) ---------------- */

async function showFuzzyFilePicker() {
  const items: FileItem[] = fileIndex.map((uri) => toQuickPickItem(uri));

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
      qp.items = qp.items.map((i) => (i.uri.toString() === item.uri.toString() ? item : i));
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
      qp.items = fileIndex.map((uri) => toQuickPickItem(uri));
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

async function ensurePreviewForItem(item: FileItem) {
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

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
