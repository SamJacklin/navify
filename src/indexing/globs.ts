/**
 * Pure glob helpers for building the `findFiles` exclude pattern.
 * Kept free of the `vscode` module so they can be unit-tested directly.
 */

/**
 * Value shapes VS Code allows in `files.exclude` / `search.exclude`:
 * `true` / `false`, or a conditional `{ when: "$(basename).ts" }` that only
 * applies when a sibling file exists.
 */
export type ExcludeSetting = Record<string, boolean | { when: string } | unknown>;

/**
 * Expands brace groups into separate globs:
 * `**\/*.{js,map}` → [`**\/*.js`, `**\/*.map`].
 *
 * Navify joins every exclude into one `{a,b,c}` pattern, and VS Code's glob
 * matcher doesn't support braces nested inside braces, so each glob is
 * flattened first. Unbalanced braces are left untouched.
 */
export function expandBraces(glob: string): string[] {
  const open = glob.indexOf("{");
  if (open === -1) {
    return [glob];
  }

  let depth = 0;
  let close = -1;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") {
      depth++;
    } else if (glob[i] === "}" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return [glob];
  }

  // Split the group on top-level commas only.
  const inner = glob.slice(open + 1, close);
  const options: string[] = [];
  let start = 0;
  depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "{") {
      depth++;
    } else if (inner[i] === "}") {
      depth--;
    } else if (inner[i] === "," && depth === 0) {
      options.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  options.push(inner.slice(start));

  const prefix = glob.slice(0, open);
  const suffix = glob.slice(close + 1);
  return options.flatMap((option) => expandBraces(prefix + option + suffix));
}

/**
 * Combines Navify's own exclude globs with the workspace's exclude settings
 * into a single `{a,b,c}` pattern ("" when there is nothing to exclude).
 *
 * Only settings that are exactly `true` are applied. A conditional
 * `{ when: ... }` entry is skipped: `findFiles` can't evaluate the sibling
 * condition, and treating it as `true` would exclude far too much (e.g. every
 * `.js` file in a TypeScript project).
 */
export function combineExcludeGlobs(
  navifyGlobs: readonly string[],
  workspaceExcludes: readonly ExcludeSetting[]
): string {
  const globs = new Set<string>();
  const add = (glob: string) => expandBraces(glob).forEach((g) => globs.add(g));

  navifyGlobs.forEach(add);
  for (const setting of workspaceExcludes) {
    for (const [glob, enabled] of Object.entries(setting)) {
      if (enabled === true) {
        add(glob);
      }
    }
  }

  return globs.size ? `{${Array.from(globs).join(",")}}` : "";
}
