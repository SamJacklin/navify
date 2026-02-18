/**
 * Returns true if a path should be hidden from results.
 *
 * Directory/extension patterns (node_modules, dist, *.log, etc.) are already
 * handled by `buildExcludePattern` via `navify.excludeGlobs` — duplicating
 * them here would create a second source of truth. This function only applies
 * the one heuristic that is NOT expressible as a simple glob: the dotfile rule
 * controlled by `navify.hideHiddenFiles`.
 */
export function isJunkPath(fsPath: string, hideHidden: boolean): boolean {
  if (!hideHidden) {
    return false;
  }
  // Treat any path segment starting with "." as a hidden file/directory.
  const p = fsPath.replace(/\\/g, "/");
  return /(^|\/)\.[^/]+/.test(p);
}
