import * as vscode from "vscode";
import { buildExcludePattern } from "./excludes";
import { isJunkPath } from "./isJunkPath";

/** How long to wait after the last file/config change before rebuilding. */
const REBUILD_DEBOUNCE_MS = 500;
/** Cap for a fast build, used when someone needs results before the full build lands. */
const FAST_BUILD_MAX = 5000;

let fileIndex: vscode.Uri[] = [];
/** True once a full (uncapped) build has been applied. */
let hasFullIndex = false;
/** Incremented per full build; only the newest build's result is applied. */
let fullBuildGeneration = 0;
let inFlightFullBuild: Promise<void> | undefined;

export function getFileIndex(): vscode.Uri[] {
  return fileIndex;
}

/**
 * Rebuilds the file index.
 *
 * A full build always wins: a fast build (capped at 5,000 files) never
 * replaces a full index, and an older full build never replaces a newer one,
 * so overlapping builds can't leave the index truncated or stale.
 */
export function buildFileIndex(opts?: { fast?: boolean }): Promise<void> {
  if (opts?.fast) {
    if (hasFullIndex) {
      return Promise.resolve();
    }
    return scan(true).then((uris) => {
      if (!hasFullIndex) {
        fileIndex = uris;
      }
    });
  }

  const generation = ++fullBuildGeneration;
  const build = scan(false).then((uris) => {
    if (generation === fullBuildGeneration) {
      fileIndex = uris;
      hasFullIndex = true;
    }
  });
  inFlightFullBuild = build;
  return build;
}

/** Resolves once a full index is available, waiting for the in-flight build. */
export async function whenIndexReady(): Promise<void> {
  while (!hasFullIndex && inFlightFullBuild) {
    const build = inFlightFullBuild;
    await build.catch(() => undefined);
    if (build === inFlightFullBuild) {
      return; // newest build failed; don't spin
    }
  }
}

/**
 * Keeps the index current: rebuilds (debounced) when files are created or
 * deleted, when workspace folders change, and when any setting that affects
 * exclusions changes. Respects `files.watcherExclude`, so churn inside
 * node_modules and similar folders doesn't trigger rebuilds.
 */
export function watchFileIndex(): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildFileIndex().catch((err) => console.error("[Navify] index error:", err));
    }, REBUILD_DEBOUNCE_MS);
  };

  // Content changes don't affect the index, so ignore them.
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, true, false);

  return vscode.Disposable.from(
    watcher,
    watcher.onDidCreate(scheduleRebuild),
    watcher.onDidDelete(scheduleRebuild),
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRebuild),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("navify") ||
        e.affectsConfiguration("files.exclude") ||
        e.affectsConfiguration("search.exclude")
      ) {
        scheduleRebuild();
      }
    }),
    { dispose: () => clearTimeout(timer) }
  );
}

async function scan(fast: boolean): Promise<vscode.Uri[]> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return [];
  }

  const cfg = vscode.workspace.getConfiguration("navify");
  const maxResultsCfg = cfg.get<number>("maxResults", 100000);
  const hideHidden = cfg.get<boolean>("hideHiddenFiles", true);
  const maxResults = fast ? Math.min(FAST_BUILD_MAX, maxResultsCfg) : maxResultsCfg;

  const uris = await vscode.workspace.findFiles("**/*", buildExcludePattern(), maxResults);
  return uris.filter(
    (u) =>
      u.scheme === "file" &&
      !isJunkPath(vscode.workspace.asRelativePath(u, false), hideHidden)
  );
}
