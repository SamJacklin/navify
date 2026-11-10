import * as assert from "assert";
import { combineExcludeGlobs, expandBraces } from "../../indexing/globs";
import { isJunkPath } from "../../indexing/isJunkPath";

suite("expandBraces", () => {
  test("leaves globs without braces alone", () => {
    assert.deepStrictEqual(expandBraces("**/node_modules/**"), ["**/node_modules/**"]);
  });

  test("expands a single group", () => {
    assert.deepStrictEqual(expandBraces("**/*.{js,map}"), ["**/*.js", "**/*.map"]);
  });

  test("expands nested and repeated groups", () => {
    assert.deepStrictEqual(expandBraces("{a,b{1,2}}/*.{x,y}"), [
      "a/*.x",
      "a/*.y",
      "b1/*.x",
      "b1/*.y",
      "b2/*.x",
      "b2/*.y",
    ]);
  });

  test("leaves unbalanced braces untouched", () => {
    assert.deepStrictEqual(expandBraces("**/*.{js"), ["**/*.{js"]);
  });
});

suite("combineExcludeGlobs", () => {
  test("returns an empty string when nothing is excluded", () => {
    assert.strictEqual(combineExcludeGlobs([], [{}]), "");
  });

  test("applies only settings that are exactly true", () => {
    const pattern = combineExcludeGlobs(
      ["**/dist/**"],
      [
        {
          "**/.git": true,
          "**/off": false,
          // Conditional exclude from a typical TypeScript setup. Treating it as
          // enabled would hide every .js file in the workspace.
          "**/*.js": { when: "$(basename).ts" },
        },
      ]
    );
    assert.strictEqual(pattern, "{**/dist/**,**/.git}");
  });

  test("never produces nested braces and removes duplicates", () => {
    const pattern = combineExcludeGlobs(["**/*.{log,tmp}"], [{ "**/*.log": true }]);
    assert.strictEqual(pattern, "{**/*.log,**/*.tmp}");
  });
});

suite("isJunkPath", () => {
  test("hides dotfiles and anything inside dot-directories", () => {
    assert.strictEqual(isJunkPath(".env", true), true);
    assert.strictEqual(isJunkPath("src/.cache/a.ts", true), true);
  });

  test("shows normal files, even when the workspace is under a dot-directory", () => {
    // Callers pass workspace-relative paths, so a workspace at
    // ~/.dotfiles/project no longer hides everything.
    assert.strictEqual(isJunkPath("src/index.ts", true), false);
  });

  test("shows everything when hiding is off", () => {
    assert.strictEqual(isJunkPath(".env", false), false);
  });

  test("handles Windows separators", () => {
    assert.strictEqual(isJunkPath("src\\.cache\\a.ts", true), true);
    assert.strictEqual(isJunkPath("src\\file.ts", true), false);
  });
});
