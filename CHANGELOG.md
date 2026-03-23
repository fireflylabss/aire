# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-03-23

### Added
- Added three new view modes (Write, Preview, Split) accessible via toggle buttons in the status bar, allowing users to focus on writing, previewing, or viewing both simultaneously.

### Changed
- Centralized **Import** and **Export** menus into dominant floating panels (matching the Search UX) with descriptive items and backdrop blurring, deprecating the old sparse tooltips.
- Removed the subtle `radial-gradient` glow from the markdown preview pane to maintain absolute solid-color contrast and cleaner aesthetics.
- Removed the automatic code block `.collapsible` feature. Large code blocks (or unclosed blocks) now render their full length without masking content or creating artificial scrolling traps.
- Completely revamped the color palette across the entire app (Notion-style aesthetics), switched dark mode accent color from blue to orange, and softened the light mode for reduced eye strain and a premium feel.
- Set Dark Mode as the default theme for all new workspaces/users.

### Removed
- **Table of Contents (TOC)** entirely purged from the application structure, internal logic, and toolbars to align natively with zero-distraction layout goals.

### Fixed
- Fixed a severe UX scroll trap specific to Chromium-based Webviews (like IDE browser previews) where `<pre>` blocks with `overflow-x: auto` would swallow vertical scroll inputs. Implemented explicit `overflow-y: hidden` and a forceful `deltaY` javascript bubbling bypass.
- Fixed `app.css` code block structural integrity by hardening `white-space: pre` and `word-break: normal`, preventing global word-wrap variables from destroying line numbers and block widths inside the markdown output.
- Fixed build warnings by removing unused CSS selectors in `App.svelte` and properly configuring `chunkSizeWarningLimit` and `manualChunks` in Vite.
## [0.2.1] - 2026-03-21

### Added
- Fullscreen mode toggle button in toolbar (desktop and mobile) with visual feedback showing Maximize/Minimize icons based on current state.

### Changed
- Toolbar layout reorganized into two distinct sections: formatting controls on the left and view/preview controls on the right, with flexible spacing between them for better visual separation.

### Fixed
- Scroll/overflow issue where status bar was being pushed down when writing long content. Editor and line numbers now properly constrain height and allow independent scrolling.

## [0.2.0] - 2026-03-21

### Added
- Unified writing + preview command bar with grouped icon actions, compact density, and responsive overflow behavior.
- Interactive markdown table inserter (grid selector up to 10x10) with live hover dimensions and fast insertion.
- Emoji insertion popup integrated into the toolbar with cursor-aware insertion.
- Import/export split into dedicated interactive menus (import markdown, export markdown/html/pdf).
- Global search panel improvements: centered modal layout, result count, close control, Enter-to-open-first-result, and Escape handling.
- Keyboard productivity shortcuts expanded (underline, strikethrough, heading levels, list helpers) plus Tab/Shift+Tab indentation handling for single and multiline selections.
- App shell polish: explicit app brand in header (`Aire`), updated browser title (`Aire — Write`), and minimalist horizontal tab scrollbar for large tab sets.

### Changed
- Internal state model normalized to single-scope documents (workspace model removed from runtime store API and state shape).
- Persistence migrated from legacy `aire-v1` shape to normalized `aire-v2` shape, with backward-compatible loading from old data.
- Maximum tab capacity raised to 32 and enforced consistently across document creation/import paths.
- Word wrap behavior aligned across editor and preview; TOC text wrapping behavior hardened for long heading content.
- TOC visual design refreshed (denser structure, cleaner header hierarchy, improved row separation/hover readability).
- Toolbar spacing and divider rhythm refined for cleaner scan and better affordance without extra chrome.

### Fixed
- Eliminated store/UI mismatch where workspace logic remained in the store even after workspace controls were removed from UI.
- Removed dead/orphaned UI state and handlers that could mask regressions during maintenance.
- Fixed multiple interaction edge cases around popover closing logic and keyboard escape behavior.
- Stabilized tab rename/close/new flows under high tab counts with consistent active-document fallback behavior.
- Resolved search panel QoL regressions (predictable focus/close/open flow via keyboard).

### Historical Context (from older versions)
- Consolidates prior 1.0.x and 1.1.x evolution into a stable 1.2.0 baseline: command palette maturity, advanced markdown rendering (KaTeX/callouts/tables/tasks), autosave/history continuity, and compact dark-first UI direction.
- Previous exploratory workspace/history/sync surface area was pruned or normalized where it no longer matched product direction, reducing legacy complexity and behavioral drift.
- Legacy status-bar verbosity and duplicated toolbar controls were simplified into clearer, denser interactions while preserving core writing and export workflows.

## [0.1.0] - 2026-03-04

### Added
- Command palette (Ctrl/Cmd+K) with searchable commands for new doc, download, word wrap, etc., plus keyboard navigation and backdrop dismiss.
- Interactive task list checkboxes in the preview that update the markdown source instantly (keeps scroll/caret positions).
- Inline ($...$) and block ($$...$$) LaTeX rendering powered by KaTeX, including CSS import.
- Code blocks gain per-block toolbar: copy button and collapse/expand toggle, both animated.
- ARIA live region announcements for key actions and aria-label on editor for screen readers.
- Per-document persistence of editor selection/caret and scroll, plus preview scroll restore when switching tabs.
- Status bar redesigned into pills showing docs, words, chars, lines, selection length (when present), wrap state, autosave state, and current caret line/column.
- "Copy status" pill to copy all stats at once with accent flash feedback.
- Enlarged/respaced task list checkboxes in preview to improve hit area and alignment.
- Subtle, smoother accent animations applied to buttons, tabs, code toolbars, and resizer interactions.

## [0.0.1] - 2025-03-03

### Added
- Word wrap toggle with keyboard shortcut (Ctrl+W)
- Visual indicator for word wrap state in status bar

### Changed
- Simplified README documentation
- License changed from MIT to GPL v3

### Removed
- Screenshots section from README
- Excessive emojis and visual noise from documentation

## [0.0.0] - 2025-03-03

### Added

- Initial release of Aire - a modern markdown editor built with Svelte + TypeScript + Vite
- Full GitHub Flavored Markdown support
- Live split-pane preview with real-time rendering
- Syntax highlighting powered by highlight.js
- Multiple document tabs for managing multiple files
- Light and dark themes for comfortable editing
- Auto-save to localStorage to prevent data loss
- Draggable editor/preview resizer for customizable workspace
- Keyboard shortcuts (Ctrl+N, Ctrl+S, Ctrl+D) for quick actions
- Tab renaming with double-click for better organization
- Download markdown files functionality
- Line numbers for easier navigation
- Responsive design for various screen sizes
