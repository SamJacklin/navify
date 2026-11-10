# Changelog

All notable changes to the Navify extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **Recently opened files view** — automatically tracked session history for quick return navigation, acting as a working memory layer
- **Explorer Plus component** — focused folder view allowing users to select one or two folders as an active workspace subset
- **Keyboard-first file search** — tab-based panel layout with fast fuzzy matching, immediate filtering, and quick-open behaviour
- Dedicated `FileList` component extracted from the main App for reusable, composable file list rendering
- `useKeyboardNav` hook for consistent keyboard navigation across file list views
- `RecentFilesTracker` module for tracking and persisting recently opened files
- Formalised webview/extension message architecture with typed message contracts (`src/types.ts`)
- Dedicated `NavifySearchViewProvider` class for webview lifecycle management
- Modular indexing layer: `fileIndex.ts`, `excludes.ts`, `isJunkPath.ts`
- Standalone fuzzy file picker via `showFuzzyFilePicker.ts`
- Webview HTML generation extracted to `src/webview/html.ts`

### Changed
- **UI revamp** — Search and Explorer Plus are now separate native views in the Navify sidebar instead of tabs inside one webview, so VS Code provides the section headers, collapsing and reordering
- Removed the in-panel logo header, tab bar and emoji icons; icons now use VS Code codicons
- Rows are a compact 22px with right-aligned muted metadata (search results show their folder beside the file name) and a soft, theme-derived selection tint; every colour comes from the active theme
- Explorer Plus "Change folders" is also available as a title-bar action once folders are focused
- `NavifySearchViewProvider` renamed to `NavifyViewProvider` and shared by both views
- Migrated webview frontend from vanilla JS to **Preact** with **esbuild** bundling for improved performance and component-based architecture
- Redesigned panel UI with tab navigation, improved accessibility, and keyboard-first interaction model
- Refactored file indexing to unify exclude patterns and eliminate redundant global state
- Consolidated extension entry point (`extension.ts`) by extracting concerns into dedicated modules
- Updated dependency versions across `package.json`

### Fixed
- File indexing now correctly filters out cache files and junk paths to reduce noise in search results

---

## [0.0.1] - 2025-09-27

### Added
- Initial Navify extension scaffolded with VS Code extension template structure
- File search functionality integrated with VS Code quick-pick
- View configurations for the Navify panel (`package.json` contributions)
- Logo and media assets
- File indexing with VS Code engine version compatibility improvements
- Basic README documenting the extension's purpose and capabilities
