---
name: check-guidelines
description: Strict review of a Navify change (or a PLAN.md) against CONTRIBUTING.md. Use before calling code done, before opening a PR, on a plan before coding, or when asked to "check the guidelines". Args - optional target (branch, PR, diff range, or "plan") and optional "--fix".
---

Review a change strictly against `CONTRIBUTING.md`. Report only, unless `--fix` was passed.

## What to review

- The target from the args, or the current branch (say which). Diff against `origin/main` after fetching it. Treat moved files as moves, not new code.
- With `plan`, review `PLAN.md` before any code is written: does it look for the same issue elsewhere, check what VS Code already provides, consider a refactor or a generic fix before a patch, and justify a patch if it chose one?

## Guidelines

Read `CONTRIBUTING.md` in full every time; don't review from memory. Part 2 is the rule set. Section 9 lists changes that need edits in several files: for every heading there that matches the diff, check each item and report which ones the diff misses.

Also check the following, whatever changed:

- No `any`, and no `as` casts that skip a check.
- Comments are short and rare, and explain why.
- If anything under `webview/src/` changed, `media/webview/dist/` was rebuilt in the same PR. Run `npm run build:webview` and check that `git status` shows no change to `dist/`.
- `CHANGELOG.md` and `README.md` are updated for any change a user would notice.

Split the work across subagents if the change is large.

## What matters most

- **Same issue elsewhere.** Search, the quick pick, Explorer Plus and recent files share the index and URI handling. For each fix, look for sibling code with the same pattern and say whether each was fixed, is fine, or was missed.
- **Paths.** Any match or filter on an absolute path, or `fsPath` string handling that breaks on Windows separators or multi-root workspaces.
- **Right layer.** A fix belongs where every caller passes through, such as the index, the provider or a shared component, not patched at one call site.
- **Native look.** UI changes use theme tokens, `Row` and codicons, and stay flat and square. Check the screenshots in the PR if there are any.

## Checks

Run `npm run compile`, `npm run check:webview`, `npm run lint` and `npm run test:unit`, and report any failures as findings.

## Report

- Check every finding against the code before reporting it. Drop what doesn't hold up, and mark anything you didn't check.
- Start with whether the change is ready. Then list the findings, most severe first, each with the guideline section, `file:line`, the problem and the fix.
- Ask about real choices one at a time. Give enough context to answer without scrolling back: what the finding is, why it matters, what each option changes, and your recommendation.

With `--fix`: confirm the list first, apply it, skip anything that would change intended behaviour, then run the checks again.
