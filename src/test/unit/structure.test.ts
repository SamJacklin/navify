import * as assert from "assert";
import { Area, buildStructure } from "../../structure/buildStructure";

function find(area: Area, path: string): Area | undefined {
  if (area.path === path) {
    return area;
  }
  for (const child of area.children) {
    const found = find(child, path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

suite("buildStructure", () => {
  test("top-level folders become areas, sorted by name", () => {
    const root = buildStructure("app", ["src/a.ts", "Docs/guide.md", "tests/a.test.ts", "README.md"]);
    assert.strictEqual(root.name, "app");
    assert.strictEqual(root.kind, "root");
    assert.deepStrictEqual(
      root.children.map((c) => [c.name, c.kind]),
      [
        ["Docs", "docs"],
        ["src", "folder"],
        ["tests", "tests"],
      ]
    );
  });

  test("packages nest under the nearest area, named relative to it", () => {
    const root = buildStructure("mono", [
      "package.json",
      "packages/ui/package.json",
      "packages/ui/src/index.ts",
      "packages/core/deep/lib/Cargo.toml",
      "packages/core/deep/lib/src/lib.rs",
    ]);
    const packages = find(root, "packages");
    assert.deepStrictEqual(
      packages?.children.map((c) => [c.name, c.kind]),
      [
        ["core/deep/lib", "package"],
        ["ui", "package"],
      ]
    );
    // The root has a manifest but stays the root.
    assert.strictEqual(root.kind, "root");
  });

  test("counts and languages include sub-areas", () => {
    const root = buildStructure("mono", [
      "packages/ui/package.json",
      "packages/ui/a.tsx",
      "packages/ui/b.tsx",
      "packages/ui/c.css",
      "packages/notes.md",
    ]);
    const packages = find(root, "packages");
    assert.strictEqual(packages?.fileCount, 5);
    assert.deepStrictEqual(packages?.languages, ["tsx", "css", "json"]);
    assert.strictEqual(find(root, "packages/ui")?.fileCount, 4);
    assert.strictEqual(root.fileCount, 5);
  });

  test("dotfiles have no extension", () => {
    const root = buildStructure("app", [".gitignore", ".env"]);
    assert.deepStrictEqual(root.languages, []);
    assert.strictEqual(root.fileCount, 2);
  });

  test("key files: readme, then manifest, then entry points", () => {
    const root = buildStructure("app", ["index.ts", "util.ts", "package.json", "README.md"]);
    assert.deepStrictEqual(root.keyFiles, [
      { path: "README.md", role: "readme" },
      { path: "package.json", role: "manifest" },
      { path: "index.ts", role: "entry" },
    ]);
  });

  test("entry points in a package's src/ belong to the package, listed once", () => {
    const root = buildStructure("app", [
      "src/main.ts",
      "src/nested/main.ts",
      "packages/ui/package.json",
      "packages/ui/src/index.ts",
    ]);
    // Top-level src is its own area, so its entry point stays there.
    assert.deepStrictEqual(root.keyFiles, []);
    assert.deepStrictEqual(find(root, "src")?.keyFiles, [{ path: "src/main.ts", role: "entry" }]);
    assert.deepStrictEqual(find(root, "packages/ui")?.keyFiles.map((k) => k.path), [
      "packages/ui/package.json",
      "packages/ui/src/index.ts",
    ]);
  });

  test("key files are capped per area", () => {
    const root = buildStructure("app", [
      "README.md",
      "package.json",
      "index.ts",
      "main.ts",
      "app.ts",
      "server.ts",
    ]);
    assert.strictEqual(root.keyFiles.length, 4);
  });

  test("Windows separators are normalised", () => {
    const root = buildStructure("app", ["packages\\ui\\package.json", "packages\\ui\\index.ts"]);
    const ui = find(root, "packages/ui");
    assert.strictEqual(ui?.kind, "package");
    assert.deepStrictEqual(ui?.keyFiles.map((k) => k.path), [
      "packages/ui/package.json",
      "packages/ui/index.ts",
    ]);
  });

  test("an empty workspace is just the root", () => {
    const root = buildStructure("empty", []);
    assert.deepStrictEqual(root, {
      name: "empty",
      path: "",
      kind: "root",
      fileCount: 0,
      languages: [],
      keyFiles: [],
      children: [],
    });
  });
});
