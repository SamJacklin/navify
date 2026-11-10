import * as vscode from "vscode";
import { combineExcludeGlobs, ExcludeSetting } from "./globs";

/**
 * Builds the glob exclude pattern for `workspace.findFiles`.
 *
 * Source of truth for default exclusions is `package.json`'s
 * `navify.excludeGlobs` default array — VS Code surfaces those defaults
 * automatically, so we never hard-code them here.
 *
 * If `navify.respectWorkspaceExcludes` is true (default), enabled globs from
 * `files.exclude` and `search.exclude` are merged in too.
 */
export function buildExcludePattern(): string {
  const cfg = vscode.workspace.getConfiguration("navify");
  // VS Code merges package.json defaults into the returned value automatically.
  const navifyGlobs = cfg.get<string[]>("excludeGlobs", []);

  const workspaceExcludes: ExcludeSetting[] = [];
  if (cfg.get<boolean>("respectWorkspaceExcludes", true)) {
    const globalCfg = vscode.workspace.getConfiguration();
    workspaceExcludes.push(
      globalCfg.get<ExcludeSetting>("files.exclude") ?? {},
      globalCfg.get<ExcludeSetting>("search.exclude") ?? {}
    );
  }

  return combineExcludeGlobs(navifyGlobs, workspaceExcludes);
}
