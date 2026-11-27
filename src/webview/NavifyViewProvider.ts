import * as vscode from "vscode";
import * as path from "path";
import { DirNode, FileItemPayload, OutboundMessage, TreeNode, ViewKind } from "../types";
import { getFileIndex, whenIndexReady } from "../indexing/fileIndex";
import { RecentFilesTracker } from "../recentFiles/RecentFilesTracker";
import { buildStructurePayload } from "../structure/structurePayload";
import { getHtml } from "./html";

const MAX_SEARCH_RESULTS = 300;

/**
 * Backs one Navify sidebar view. Every view shares the same webview bundle and
 * message protocol; `kind` decides which UI the bundle renders.
 */
export class NavifyViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  /** Folders to focus, kept until the Explorer Plus webview acts on them. */
  private pendingFocus?: string[];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly recentFiles: RecentFilesTracker,
    private readonly kind: ViewKind
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    const { webview } = webviewView;
    this.webview = webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")],
    };

    webview.html = await getHtml(webview, this.ctx.extensionUri, this.kind);

    // Push current state as soon as the view is ready.
    this.sendRecentFiles();
    this.sendActiveFile();

    webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as {
        type?: string;
        q?: string;
        uri?: string;
        folderUris?: string[];
        mode?: string;
      } | null;

      if (msg?.type === "READY") {
        // The webview's listener is now attached, so state sent above may have
        // been dropped; send it again.
        this.sendRecentFiles();
        this.sendActiveFile();
        if (this.pendingFocus) {
          this.post({ type: "EXPLORER_FOCUS", folderUris: this.pendingFocus });
        }
        return;
      }

      if (msg?.type === "STRUCTURE_GET") {
        await whenIndexReady();
        this.sendStructure();
        return;
      }

      if (msg?.type === "FOCUS_IN_EXPLORER" && msg.uri) {
        await vscode.commands.executeCommand("navify.explorer.focusFolder", msg.uri);
        return;
      }

      if (msg?.type === "EXPLORER_MODE") {
        // Drives the "Change Focused Folders" button in the view title bar.
        await vscode.commands.executeCommand(
          "setContext",
          "navify.explorerFocused",
          msg.mode === "tree"
        );
        return;
      }

      if (msg?.type === "SEARCH") {
        const query = String(msg.q ?? "");
        const q = query.toLowerCase().trim();

        // A search typed during startup would otherwise run against an empty
        // index and never be retried.
        await whenIndexReady();

        const items: FileItemPayload[] = [];
        if (q) {
          for (const u of getFileIndex()) {
            // Match the workspace-relative path, not the absolute one: the
            // absolute path contains the user's home and the project's own
            // folder name, so queries like "users" or "navify" matched every file.
            const rel = vscode.workspace.asRelativePath(u);
            if (rel.toLowerCase().includes(q)) {
              items.push({ label: path.basename(u.fsPath), path: rel, uri: u.toString() });
              if (items.length >= MAX_SEARCH_RESULTS) {
                break;
              }
            }
          }
        }

        // Echo the query so the webview can drop replies to superseded searches.
        this.post({ type: "RESULTS", q: query, items });
        return;
      }

      if (msg?.type === "OPEN" && msg.uri) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.parse(msg.uri), {
            preview: true,
          });
        } catch {
          vscode.window.showErrorMessage("Could not open file.");
        }
        return;
      }

      if (msg?.type === "EXPLORER_GET_DIR_TREE") {
        const roots = buildDirTree();
        webview.postMessage({
          type: "EXPLORER_DIR_TREE",
          roots,
        } as OutboundMessage);
        return;
      }

      if (msg?.type === "EXPLORER_GET_TREE" && Array.isArray(msg.folderUris)) {
        this.pendingFocus = undefined;
        const roots = buildExplorerTree(msg.folderUris);
        webview.postMessage({
          type: "EXPLORER_TREE",
          roots,
        } as OutboundMessage);
        return;
      }
    });
  }

  post(message: OutboundMessage): void {
    this.webview?.postMessage(message);
  }

  sendRecentFiles(): void {
    this.post({ type: "RECENT_FILES", items: this.recentFiles.toPayload() });
  }

  sendStructure(): void {
    if (this.webview) {
      this.post({ type: "STRUCTURE", roots: buildStructurePayload() });
    }
  }

  /**
   * Shows the given folders in Explorer Plus. The webview may not be listening
   * yet if the view was only just revealed, so the request is resent on READY.
   */
  focusFolders(folderUris: string[]): void {
    this.pendingFocus = folderUris;
    this.post({ type: "EXPLORER_FOCUS", folderUris });
  }

  sendActiveFile(): void {
    const uri = vscode.window.activeTextEditor?.document.uri?.toString() ?? null;
    this.post({ type: "ACTIVE_FILE", uri });
  }
}

// ── Explorer Plus helpers ─────────────────────────────────────────────────────

/**
 * Builds a navigable directory-only tree for the Explorer Plus folder picker.
 * Each workspace root becomes a top-level DirNode whose children are derived
 * from the in-memory file index — so only directories that contain at least
 * one indexed file appear, keeping the tree lean.
 */
function buildDirTree(): DirNode[] {
  const wsFolders = vscode.workspace.workspaceFolders ?? [];

  return wsFolders.map((wsFolder) => {
    const wsPath = wsFolder.uri.fsPath;

    const root: DirNode = {
      name: wsFolder.name,
      path: wsFolder.name,
      uri: wsFolder.uri.toString(),
      children: [],
    };

    for (const file of getFileIndex()) {
      if (!file.fsPath.startsWith(wsPath + path.sep)) {
        continue;
      }
      const rel = path.relative(wsPath, file.fsPath);
      const parts = rel.split(path.sep);
      // All parts except the last one (filename) are directories.
      if (parts.length > 1) {
        insertDirParts(root.children, parts.slice(0, -1), wsPath);
      }
    }

    sortDirNodes(root.children);
    return root;
  });
}

/** Recursively inserts directory segments into the DirNode tree. */
function insertDirParts(
  children: DirNode[],
  parts: string[],
  currentPath: string
): void {
  if (parts.length === 0) {
    return;
  }

  const [dirName, ...rest] = parts;
  let node = children.find((c) => c.name === dirName);

  if (!node) {
    const dirFsPath = path.join(currentPath, dirName);
    node = {
      name: dirName,
      path: vscode.workspace.asRelativePath(dirFsPath),
      uri: vscode.Uri.file(dirFsPath).toString(),
      children: [],
    };
    children.push(node);
  }

  insertDirParts(node.children, rest, path.join(currentPath, dirName));
}

/** Sorts DirNodes alphabetically (case-insensitive), recursively. */
function sortDirNodes(nodes: DirNode[]): void {
  nodes.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  for (const node of nodes) {
    sortDirNodes(node.children);
  }
}

/**
 * Builds a file+directory tree for the given folder URIs by filtering the
 * file index and organising the results into nested TreeNode objects.
 */
function buildExplorerTree(folderUris: string[]): TreeNode[] {
  return folderUris.map((folderUriStr) => {
    const folderUri = vscode.Uri.parse(folderUriStr);
    const folderPath = folderUri.fsPath;

    const root: TreeNode = {
      name: path.basename(folderPath),
      path: vscode.workspace.asRelativePath(folderPath),
      uri: folderUriStr,
      type: "dir",
      children: [],
    };

    const files = getFileIndex().filter((u) =>
      u.fsPath.startsWith(folderPath + path.sep)
    );

    for (const file of files) {
      const relPath = path.relative(folderPath, file.fsPath);
      const parts = relPath.split(path.sep).filter(Boolean);
      if (parts.length > 0) {
        insertFilePath(root.children!, parts, file, folderPath);
      }
    }

    sortTreeNodes(root.children!);
    return root;
  });
}

/** Recursively inserts a file URI into the correct position in the tree. */
function insertFilePath(
  children: TreeNode[],
  parts: string[],
  file: vscode.Uri,
  currentFolderPath: string
): void {
  if (parts.length === 1) {
    children.push({
      name: parts[0],
      path: vscode.workspace.asRelativePath(file),
      uri: file.toString(),
      type: "file",
    });
    return;
  }

  const [dirName, ...rest] = parts;
  let dirNode = children.find((c) => c.type === "dir" && c.name === dirName);

  if (!dirNode) {
    const dirFsPath = path.join(currentFolderPath, dirName);
    dirNode = {
      name: dirName,
      path: vscode.workspace.asRelativePath(dirFsPath),
      uri: vscode.Uri.file(dirFsPath).toString(),
      type: "dir",
      children: [],
    };
    children.push(dirNode);
  }

  insertFilePath(
    dirNode.children!,
    rest,
    file,
    path.join(currentFolderPath, dirName)
  );
}

/** Sorts nodes in-place: directories first, then files, both alphabetically. */
function sortTreeNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  for (const node of nodes) {
    if (node.children) {
      sortTreeNodes(node.children);
    }
  }
}
