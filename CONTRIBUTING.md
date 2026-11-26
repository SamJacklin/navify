# Contributing to Navify

Thanks for helping. Part 1 gets you from a fresh clone to an open PR. Part 2 covers the conventions
reviewers check, and the places where one change needs edits in several files that nothing
enforces. Read Part 2 before requesting review; the checklist at the end is the short version.

> If a rule here could be enforced by a tool and isn't, that's a config gap worth a PR. Today we
> run TypeScript `strict` on both the extension (`npm run compile`) and the webview
> (`npm run check:webview`), and ESLint on `src/` only, with a handful of rules at warning level.
> The webview isn't linted.

---

# Part 1 — Getting started

## Set up

You need Node.js 20 or later and VS Code 1.101 or later.

```sh
git clone https://github.com/SamJacklin/navify.git
cd navify
npm install
npm run build:webview
```

Open the folder in VS Code and press **F5**. This compiles the extension and opens an
**Extension Development Host**: a second VS Code window with Navify loaded. Open any project in
that window to try it.

## The development loop

Navify has two halves that build separately:

| Half | Source | Built by | To see a change |
|---|---|---|---|
| Extension host (Node) | `src/` | `npm run watch`, started automatically by F5 | Run **Developer: Reload Window** in the development host |
| Webview UI (browser, Preact) | `webview/src/` | `npm run watch:webview`, which you start yourself in a terminal | Run **Developer: Reload Webviews** in the development host |

If the UI hasn't changed after an edit, the webview watcher probably isn't running.

## Checks

Run all of these before pushing. A PR must pass them all.

| Command | What it does |
|---|---|
| `npm run compile` | Type-checks and builds the extension |
| `npm run check:webview` | Type-checks the webview |
| `npm run lint` | ESLint on `src/` |
| `npm run test:unit` | Unit tests for pure logic (Mocha, no VS Code needed) |
| `npm run build:webview` | Production webview bundle (see [§9](#9-multi-file-pitfalls)) |

## Project layout

```
src/                        Extension host
  extension.ts              Activation: registers views, commands and event listeners
  types.ts                  Shared types and the webview message protocol (host side)
  indexing/                 The workspace file index
    fileIndex.ts            Builds the index and keeps it current
    excludes.ts, globs.ts   Turns settings into one exclude glob
    isJunkPath.ts           Hidden-file filtering
  quickpick/                "Navify: Fuzzy File Search" quick pick
  recentFiles/              Recently opened files
  webview/
    NavifyViewProvider.ts   Backs each sidebar view; handles webview messages
    html.ts                 Webview HTML and Content Security Policy
  test/unit/                Unit tests
webview/                    Webview UI (Preact, bundled with esbuild)
  src/api.ts                The message protocol (webview side) and post/onMessage
  src/main.tsx              Picks the view to render
  src/components/           SearchView, ExplorerPlus, FileList, Row
  src/styles.css            All styling; theme tokens at the top
media/webview/              HTML template and the built bundle (dist/ is committed)
```

**How the parts talk.** Every sidebar view is a webview backed by one `NavifyViewProvider`. The
extension host owns the state: the file index, recent files and the active editor. The webview
renders what it's sent. They exchange typed messages: the webview posts requests such as `SEARCH`
or `OPEN`, and the host replies with messages such as `RESULTS` or `RECENT_FILES`.

## Workflow

1. **Branch from an up-to-date `main`**, named `<your-initials>/<short-description>`, for example
   `sgj/persist-recent-files`. Never commit to `main`.
2. **Commit messages are one line**, in the form `type: lowercase summary`, with no body. Use
   `feat`, `fix`, `refactor`, `docs` or `chore`. Look at `git log` for examples.
3. **Update `CHANGELOG.md`** under `[Unreleased]` for anything a user would notice, and
   `README.md` when you change a command, setting or feature description.
4. **Open a PR against `main`.** Say what changed and why, and how you tested it. Include
   screenshots in light and dark themes for any UI change. List anything you found but didn't fix.
5. **Check your change against Part 2.** If you use Claude Code, the `/check-guidelines` skill in
   `.claude/skills/` reviews a branch against this guide.
6. **Stay rebased on `main`.** PRs are merged with *Rebase and merge*, so keep each commit
   meaningful and passing the checks on its own.

---

# Part 2 — Conventions and review checklist

Section 0 is about the approach, before you write any code. Sections 1–8 are what a review of a
single file catches. Section 9 covers changes that need a second location updated by hand.
Section 10 is about PR scope.

## 0. Before you write code — is this the right fix?

- **Fix the cause, not the symptom.** If search returns the wrong files, fix how the index is
  built or matched, rather than filtering the results in the webview.
- **Look for the same issue elsewhere.** Search, the quick pick, Explorer Plus and recent files all
  read the same index and handle the same URIs. A bug in one is often in the others. Fix it
  everywhere, or say in the PR why the others are fine.
- **Check what VS Code already provides.** Navify works alongside the built-in Explorer and Quick
  Open, not as a replacement. Before building a widget, setting or behaviour, check whether a VS
  Code API or an existing setting already covers it. For example, Navify respects `files.exclude`
  instead of keeping its own copy.
- **Weigh the cost against the gain.** A small improvement that adds a setting, a message type
  and a branch in three files usually isn't worth it.
- **Large PRs get a simplification pass.** Before asking for review on anything over about 400
  added lines, read it again and ask what you can remove: guards for cases that can't happen,
  options nobody asked for, parts that could be a separate PR.

## 1. TypeScript

Both halves compile with `strict`. Keep it that way.

- **No `any`.** Data that arrives untyped (webview messages, settings, file contents) is
  `unknown` until it's checked.
- **Switch on the discriminant.** Messages are discriminated unions on `type`. Narrow with
  `msg.type === "..."` and let the compiler check the fields, instead of casting.
- **Let inference work.** Don't annotate what the compiler already infers. Do annotate empty
  collections that are filled later (`const items: FileItemPayload[] = []`) and every exported
  function's parameters.
- **Be explicit about absence.** A value that can be missing is `T | undefined` (or `T | null`
  when it crosses the webview boundary, because JSON has no `undefined`).
- **Avoid `!` non-null assertions** unless the line above makes it obvious why the value exists.

## 2. Don't hardcode

- **Limits and timings are named constants** at the top of the file that uses them, for example
  `MAX_SEARCH_RESULTS` and `REBUILD_DEBOUNCE_MS`.
- **Anything a user might reasonably want to change is a `navify.*` setting.** Declare it in
  `package.json` and document it in the README. Read it with
  `vscode.workspace.getConfiguration("navify")` when it's used, not once at activation, so changes
  apply without a reload.
- **Never hardcode a colour, font or size in the webview.** See [§5](#5-webview-ui).

## 3. Paths and URIs

Most of Navify's bugs so far have been path bugs.

- **Match and filter on workspace-relative paths, never absolute ones.** An absolute path contains
  the user's home folder and the project's own folder name, so a search for `users`, or a check
  for a hidden `.folder`, matches every file. Use `vscode.workspace.asRelativePath(uri, false)`.
- **A `vscode.Uri` is the identity of a file.** Compare URIs with `uri.toString()`, and send
  URI strings, not file system paths, across the webview boundary.
- **Only index `file:` URIs.** Other schemes (`untitled:`, `git:`, `vscode-remote:` virtual files)
  can reach editor events. Ignore them unless the feature is meant for them.
- **Handle both separators.** Code that splits paths must work with `\` on Windows. Use `path`
  helpers, or test with both separators, as `isJunkPath` does.
- **Think about multi-root workspaces.** With more than one folder open, `asRelativePath(uri)`
  prefixes the folder name. Decide whether you want that.

## 4. Extension host

- **Register everything as a disposable.** Push every listener, watcher, provider and command onto
  `context.subscriptions`, or return a `Disposable` that the caller pushes.
- **Don't block activation.** Start slow work, such as building the index, without awaiting it.
  Features that need the index call `await whenIndexReady()`.
- **Debounce event-driven work.** File system and configuration events arrive in bursts, for
  example from a `git checkout`. Batch them, as `watchFileIndex` does.
- **Cap anything that grows with the workspace.** Result lists, trees and payloads posted to the
  webview need a limit. A repository can have hundreds of thousands of files.
- **Run independent async work concurrently** with `Promise.all`, not `await` inside a loop.
- **No synchronous file system calls** (`fs.readFileSync` and similar). They freeze every
  extension, not just Navify.

## 5. Webview UI

**Behaviour**

- **The host is the source of truth.** The webview holds only UI state: the query, the selection,
  which folders are expanded. Anything else comes from a host message.
- **Register listeners before asking for data.** The webview posts `READY` from an effect declared
  *after* its `onMessage` effect. The host resends its state on `READY`, because anything posted
  before the listener existed was dropped. Keep that order in new views.
- **Replies that can arrive out of order carry what they answer.** `RESULTS` echoes its query so
  the webview can drop replies to an older search. Do the same for any request the user can
  repeat quickly.
- **Every action works from the keyboard.** The search list uses `useKeyboardNav`: the arrow keys
  move, Enter opens and Escape clears. Explorer Plus rows are focusable and respond to Enter and
  Space. A new list should do one or the other.

**Look: native, neat and crisp**

The views should look like part of VS Code, not a web page inside it.

- **Colours come only from the theme.** Use the tokens at the top of `styles.css`, which map to
  `--vscode-*` variables. Add a token rather than using a raw variable or hex value in a rule.
  Check your change in a light, a dark and a high-contrast theme.
- **Use the `Row` component for list and tree rows.** Rows are 22px high, square and edge to
  edge. Selection uses the theme's list colours plus a 1px focus outline.
- **Icons are codicons** (`<i class="codicon codicon-...">`). Don't use emoji or custom images.
- **Keep it flat.** No shadows, gradients (except indent guides), rounded rows, or animations
  longer than 0.3s. Use `--radius` (2px) for inputs and buttons only.
- **Spacing comes from the tokens** `--gutter`, `--row-pad` and `--indent`. Don't use one-off
  pixel values.

## 6. Readability and placement

- **One responsibility per file.** Put new code in the module whose job it is, or create a focused
  module, rather than growing `extension.ts` or `NavifyViewProvider.ts`. `extension.ts` should
  read as a list of what gets registered.
- **Keep logic pure where you can.** Code that doesn't need the VS Code API goes in a module that
  doesn't import `vscode`, as `globs.ts` does, so it can be unit tested.
- **Reuse before writing.** Check for an existing helper or component, such as `Row`, `FileList`,
  `useKeyboardNav` or `isSameOrInside`, before adding a similar one.
- **Comments explain why, not what.** Leave a comment where the code alone would mislead, such as
  a workaround, an ordering constraint or a VS Code quirk. Delete comments that restate the code.
- **No dead code.** Remove unused imports, exports, message types and CSS.
- **Prefer the simple version.** Fix the problem in front of you. Don't add a framework for one
  case.

## 7. Errors

- **Failures the user caused or can fix** get a short message with
  `vscode.window.showErrorMessage`, saying what went wrong (for example, "Could not open file.").
- **Background failures** are logged with `console.error("[Navify] ...", err)` and must not break
  the view. The view should still work with whatever data it has.
- **An empty `catch` needs a comment** saying why ignoring the error is safe.

## 8. Tests

- **Pure logic gets unit tests** in `src/test/unit/`, using Mocha's `suite`/`test` and Node's
  `assert`. These tests must not import `vscode`. If the logic you want to test does, move the
  logic into a pure module first ([§6](#6-readability-and-placement)).
- **Assert on content.** Check that the right paths came back, not just that something did. Name
  the case a test protects against, for example "a workspace under `~/.dotfiles` still shows its
  files".
- **A bug fix comes with a test** when the logic is testable.
- **Test in the Extension Development Host** for anything the unit tests can't reach, and say in
  the PR what you tried. Depending on the change, that includes:
  - a large repository;
  - a multi-root workspace;
  - creating, deleting and renaming files while the views are open;
  - light, dark and high-contrast themes;
  - keyboard-only use.
- `npm test` runs VS Code integration tests through `@vscode/test-cli`. There's only a placeholder
  test so far; new integration tests are welcome.

## 9. Multi-file pitfalls

Each of these changes needs edits in more than one place, and nothing fails if you miss one. Find
the change you're making and check every item. Symbols are named rather than file paths where the
path might move.

### Adding or changing a webview message
The protocol is defined twice and must match: `InboundMessage` and `OutboundMessage` in
`src/types.ts`, and `ToExtension` and `FromExtension` in `webview/src/api.ts`.
**Check:** both unions changed identically; the host handles it in `NavifyViewProvider`; the
component that needs it listens through `onMessage`.

### Changing anything in `webview/src/`
The built bundle in `media/webview/dist/` is committed, because the extension loads it directly.
If it isn't rebuilt, the PR still shows the old UI.
**Check:** run `npm run build:webview` (the minified production build, not watch output) and
commit `dist/`. Don't commit `.map` files.

### Adding a setting
**Check:** declared under `contributes.configuration` in `package.json`; read when it's used;
documented in the README's Configuration table. If it affects which files are indexed, add it to
the `affectsConfiguration` checks in `watchFileIndex`, or the index ignores the change until a
reload.

### Adding a command
**Check:** listed in `contributes.commands`; registered in `extension.ts`; placed in
`contributes.menus` where it belongs (with `commandPalette` set to `"when": "false"` if it only
makes sense from a view); added to the README's Commands table.

### Adding a view
**Check:** listed under `contributes.views`; a provider registered in `extension.ts` with
`retainContextWhenHidden`; a new member of `ViewKind`; a branch in `webview/src/main.tsx`; the
`READY` handshake in the new component ([§5](#5-webview-ui)).

### Loading a new kind of resource in the webview
Fonts, images and workers are blocked unless the policy allows them.
**Check:** the Content Security Policy in `getHtml`; `localResourceRoots` in `NavifyViewProvider`;
an esbuild `loader` for the file type.

### Keeping a list of files
The index, recent files and the Explorer Plus tree all go stale when files change on disk,
including through `git`.
**Check:** created, deleted and renamed files are all handled (a file system watcher, plus
`onDidRenameFiles` for renames inside VS Code); a deleted or renamed folder updates everything
inside it; non-`file:` URIs and files outside the workspace are ignored.

### Reading the index
At startup the index may be empty or partial.
**Check:** features that need it call `await whenIndexReady()`, and nothing applies a capped
(`fast`) build over a full one.

### Sending state when a view opens
**Check:** the provider sends it both on resolve and again on `READY`.

## 10. PR scope

- **One change per PR.** A fix, a feature or a refactor, not two of them together.
- **Review the file list before pushing.** No `.screenshots/`, `out/`, `.map` files or unrelated
  `dist/` changes.
- **Check open PRs** for overlap. If another PR touches the same files, agree on the merge order.

---

## TL;DR pre-PR checklist

**Approach**
- [ ] Fixes the cause; the same issue checked for in search, quick pick, Explorer Plus and recents
- [ ] Doesn't rebuild something VS Code already provides
- [ ] Over about 400 added lines: simplification pass done

**Code**
- [ ] No `any`; messages narrowed on `type`; empty accumulators annotated
- [ ] No magic numbers; user-tunable values are `navify.*` settings, read when used
- [ ] Paths matched workspace-relative; URIs compared by `toString()`; only `file:` URIs; both separators handled
- [ ] Everything registered is disposed; activation isn't blocked; event work debounced; lists capped
- [ ] No `await` in a loop for independent work; no sync file system calls
- [ ] Webview: listeners before `READY`; racing replies echo their request; every action works from the keyboard
- [ ] Look: theme tokens only, `Row` for rows, codicons, flat and square, tested in light, dark and high contrast
- [ ] New code in the module whose job it is; pure logic kept free of `vscode`; comments explain why
- [ ] User-fixable errors shown; background errors logged with `[Navify]`; empty catches explained
- [ ] Unit tests for new pure logic; manual testing described in the PR

**Multi-file**
- [ ] Message protocol identical in `src/types.ts` and `webview/src/api.ts`
- [ ] `npm run build:webview` run and `dist/` committed (no `.map` files)
- [ ] New setting: `package.json`, README and, if it affects indexing, `watchFileIndex`
- [ ] New command: `package.json` commands and menus, `extension.ts`, README
- [ ] New view: `package.json`, `extension.ts`, `ViewKind`, `main.tsx`, `READY` handshake
- [ ] New resource type: CSP, `localResourceRoots`, esbuild loader
- [ ] File lists handle create, delete and rename, including folders
- [ ] Index readers await `whenIndexReady()`

**Scope**
- [ ] One change; clean file list; overlapping PRs checked
- [ ] `CHANGELOG.md` and `README.md` updated
- [ ] `compile`, `check:webview`, `lint` and `test:unit` pass
