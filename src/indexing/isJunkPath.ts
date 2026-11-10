/**
 * Returns true if a path should be hidden from results.
 *
 * Directory/extension patterns (node_modules, dist, *.log, etc.) are already
 * handled by `buildExcludePattern` via `navify.excludeGlobs` — duplicating
 * them here would create a second source of truth. This function only applies
 * the one heuristic that is NOT expressible as a simple glob: the dotfile rule
 * controlled by `navify.hideHiddenFiles`.
 *
 * `relPath` must be relative to the workspace folder. Testing an absolute path
 * would hide every file in a workspace that itself lives under a dot-directory
 * (e.g. `~/.dotfiles/project`).
 */
export function isJunkPath(relPath: string, hideHidden: boolean): boolean {
  if (!hideHidden) {
    return false;
  }
  // Treat any path segment starting with "." as a hidden file/directory.
  const p = relPath.replace(/\\/g, "/");
  return /(^|\/)\.[^/]+/.test(p);
}
