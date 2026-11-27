# Navify

A focused file navigation panel for VS Code. Navify sits in the Activity Bar alongside VS Code's built-in tools and is designed for large codebases where the native Explorer becomes noisy. It does not replace the Explorer — it gives you a faster, more deliberate working layer on top of it.

---

## Features

### Structure

A map of the project, for finding your way around before you start working in one part of it.

- Shows the project's areas: top-level folders, plus every package found inside them (any folder with a `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `.csproj` and similar)
- Each area shows how many files it holds and its most common file types
- Expand an area to see its sub-packages and key files: the README, the manifest and entry points such as `index.ts` or `main.py`
- The area containing the file you have open is highlighted
- Hover an area and choose **Focus in Explorer Plus** to start working in it
- Updates as files are added and removed

### Explorer Plus

Focus on one or two folders at a time without restructuring your workspace. Navigate a folder picker to choose your scope, then browse only those files in a compact tree. When you open a file, it is highlighted in the tree. If a file is already open in the editor when you open the view, that is highlighted too.

- Select up to two folders as your active working scope
- Tree view is independent of the native Explorer — collapse and expand as needed
- Currently open file is tracked and highlighted automatically
- Switch back to the folder picker at any time without losing your place

Best suited for monorepos, long-running feature work, or any situation where the full file tree is more hindrance than help.

### File Search

Fuzzy file search across the full workspace, directly in the panel.

- Results update as you type
- Keyboard-navigable: open files without reaching for the mouse
- Dotfiles and build output excluded by default (configurable)

### Recently Opened Files

A lightweight list of files accessed in the current session.

- Automatically tracked, no setup required
- Reduces back-and-forth when cycling through a small set of files
- Resets on workspace reload

---

## Commands

Both commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

| Command | Description |
|---|---|
| `Navify: Focus File Search` | Opens and focuses the Navify panel |
| `Navify: Fuzzy File Search` | Opens a standalone quick-pick fuzzy file picker |

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `navify.excludeGlobs` | *(see below)* | Additional glob patterns excluded from the file index |
| `navify.respectWorkspaceExcludes` | `true` | Also apply `files.exclude` and `search.exclude` from workspace settings |
| `navify.maxResults` | `100000` | Maximum number of files to index |
| `navify.hideHiddenFiles` | `true` | Exclude dotfiles and dot-directories from results unless directly matched |

The default `excludeGlobs` covers common build artefacts and tooling directories: `node_modules`, `dist`, `out`, `.next`, `__pycache__`, `.venv`, and others.

---

## Roadmap

- **Pinned files** — bookmark files you return to frequently, persisted across sessions
- **Named worksets** — save a named Explorer Plus context (folder selection and pinned files) to restore later; useful when switching between distinct areas of work
- **Related file jumping** — hop between paired files such as `auth.ts` ↔ `auth.test.ts` or `Button.tsx` ↔ `Button.css`

---

## Installation

Navify is not yet published to the VS Code Marketplace.

To run it locally, clone the repository and open it in VS Code, then press `F5` to launch an Extension Development Host with Navify loaded.
