import * as vscode from "vscode";

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
  const globs = new Set<string>(cfg.get<string[]>("excludeGlobs", []));

  if (cfg.get<boolean>("respectWorkspaceExcludes", true)) {
    const globalCfg = vscode.workspace.getConfiguration();
    const filesExclude =
      globalCfg.get<Record<string, boolean>>("files.exclude") ?? {};
    const searchExclude =
      globalCfg.get<Record<string, boolean>>("search.exclude") ?? {};

    for (const [glob, enabled] of Object.entries(filesExclude)) {
      if (enabled) globs.add(glob);
    }
    for (const [glob, enabled] of Object.entries(searchExclude)) {
      if (enabled) globs.add(glob);
    }
  }

  return globs.size ? `{${Array.from(globs).join(",")}}` : "";
}
