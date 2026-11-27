/**
 * Turns a workspace's file list into a map of its areas: the top-level folders
 * plus every folder that is its own package. Pure, so it can be unit tested.
 */

/** Files that make the folder holding them a package (a project or library). */
const MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "setup.py",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "Gemfile",
  "pubspec.yaml",
  "mix.exs",
  "Package.swift",
]);
const PROJECT_FILE = /\.(csproj|fsproj|vbproj)$/i;
const README = /^readme(\.[a-z]+)?$/i;
const ENTRY = /^(index|main|app|server|extension|cli|lib|mod)\.[a-z0-9]+$/i;
const TEST_DIR = /^(tests?|__tests__|specs?|e2e|cypress|playwright)$/i;
const DOCS_DIR = /^(docs?|documentation)$/i;

const MAX_LANGUAGES = 3;
const MAX_KEY_FILES = 4;

export type AreaKind = "root" | "package" | "tests" | "docs" | "folder";
export type KeyFileRole = "readme" | "manifest" | "entry";

export interface KeyFile {
  /** Path relative to the workspace folder, with `/` separators. */
  path: string;
  role: KeyFileRole;
}

export interface Area {
  /** Label: the path relative to the parent area, e.g. `ui` under `packages`. */
  name: string;
  /** Path relative to the workspace folder, with `/` separators; `""` for the root. */
  path: string;
  kind: AreaKind;
  /** Files in this area, including those in its sub-areas. */
  fileCount: number;
  /** Most common file extensions, most common first. */
  languages: string[];
  keyFiles: KeyFile[];
  children: Area[];
}

/**
 * @param rootName Label for the root area, normally the workspace folder name.
 * @param files File paths relative to the workspace folder (either separator).
 */
export function buildStructure(rootName: string, files: readonly string[]): Area {
  const paths = files.map((f) => f.replace(/\\/g, "/"));

  const packageDirs = new Set<string>();
  const areaPaths = new Set<string>([""]);
  for (const file of paths) {
    const { dir, base } = split(file);
    if (isManifest(base)) {
      packageDirs.add(dir);
      areaPaths.add(dir);
    }
    const slash = file.indexOf("/");
    if (slash > 0) {
      areaPaths.add(file.slice(0, slash));
    }
  }

  const nodes = new Map<string, { area: Area; exts: Map<string, number> }>();
  for (const areaPath of areaPaths) {
    nodes.set(areaPath, {
      area: {
        name: areaPath === "" ? rootName : areaPath,
        path: areaPath,
        kind: kindOf(areaPath, packageDirs),
        fileCount: 0,
        languages: [],
        keyFiles: [],
        children: [],
      },
      exts: new Map(),
    });
  }

  for (const file of paths) {
    const { dir, base } = split(file);
    const ext = extensionOf(base);
    for (const ancestor of ancestorsOf(dir)) {
      const node = nodes.get(ancestor);
      if (node) {
        node.area.fileCount++;
        if (ext) {
          node.exts.set(ext, (node.exts.get(ext) ?? 0) + 1);
        }
      }
    }

    const role = keyFileRole(base);
    if (!role) {
      continue;
    }
    // Entry points often sit in `src/`. When `src` isn't an area of its own,
    // they belong to the area above it. Either way each file is listed once.
    const srcParent = role === "entry" ? parentOfSrc(dir) : undefined;
    const owner = nodes.get(dir) ?? (srcParent === undefined ? undefined : nodes.get(srcParent));
    owner?.area.keyFiles.push({ path: file, role });
  }

  const root = nodes.get("")?.area ?? emptyRoot(rootName);
  for (const { area, exts } of nodes.values()) {
    area.languages = [...exts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_LANGUAGES)
      .map(([ext]) => ext);
    area.keyFiles = area.keyFiles.sort(compareKeyFiles).slice(0, MAX_KEY_FILES);

    if (area === root) {
      continue;
    }
    const parent = nodes.get(nearestAncestor(area.path, areaPaths))?.area ?? root;
    area.name = parent === root ? area.path : area.path.slice(parent.path.length + 1);
    parent.children.push(area);
  }

  for (const { area } of nodes.values()) {
    area.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  return root;
}

function emptyRoot(name: string): Area {
  return { name, path: "", kind: "root", fileCount: 0, languages: [], keyFiles: [], children: [] };
}

function split(file: string): { dir: string; base: string } {
  const slash = file.lastIndexOf("/");
  return slash < 0
    ? { dir: "", base: file }
    : { dir: file.slice(0, slash), base: file.slice(slash + 1) };
}

function isManifest(base: string): boolean {
  return MANIFESTS.has(base) || PROJECT_FILE.test(base);
}

function kindOf(areaPath: string, packageDirs: Set<string>): AreaKind {
  if (areaPath === "") {
    return "root";
  }
  if (packageDirs.has(areaPath)) {
    return "package";
  }
  const base = split(areaPath).base;
  if (TEST_DIR.test(base)) {
    return "tests";
  }
  return DOCS_DIR.test(base) ? "docs" : "folder";
}

function extensionOf(base: string): string | undefined {
  const dot = base.lastIndexOf(".");
  // A leading dot is a dotfile name, not an extension.
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : undefined;
}

function keyFileRole(base: string): KeyFileRole | undefined {
  if (README.test(base)) {
    return "readme";
  }
  if (isManifest(base)) {
    return "manifest";
  }
  return ENTRY.test(base) ? "entry" : undefined;
}

const ROLE_ORDER: Record<KeyFileRole, number> = { readme: 0, manifest: 1, entry: 2 };

function compareKeyFiles(a: KeyFile, b: KeyFile): number {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.path.localeCompare(b.path);
}

/** `""`, then each folder down to and including `dir`. */
function ancestorsOf(dir: string): string[] {
  const result = [""];
  if (dir === "") {
    return result;
  }
  let end = dir.indexOf("/");
  while (end > 0) {
    result.push(dir.slice(0, end));
    end = dir.indexOf("/", end + 1);
  }
  result.push(dir);
  return result;
}

function nearestAncestor(areaPath: string, areaPaths: Set<string>): string {
  let dir = split(areaPath).dir;
  while (dir !== "" && !areaPaths.has(dir)) {
    dir = split(dir).dir;
  }
  return dir;
}

/** The folder above a `src` folder, if `dir` is one. */
function parentOfSrc(dir: string): string | undefined {
  if (dir === "src") {
    return "";
  }
  return dir.endsWith("/src") ? dir.slice(0, -"/src".length) : undefined;
}
