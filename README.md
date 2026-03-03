# Aire

A modern markdown editor built with Svelte featuring live preview, syntax highlighting, and a distraction-free interface.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Features

- **Clean markdown editing** - Distraction-free writing interface with GitHub Flavored Markdown support (tables, task lists, strikethrough)
- **Live preview** - Real-time rendered preview with split-pane view and synchronized scrolling
- **Syntax highlighting** - Support for 100+ programming languages via highlight.js
- **Multi-document support** - Work with multiple tabs simultaneously, double-click to rename
- **Themes** - Light and dark themes with persistent preference
- **Auto-save** - Automatic saving to localStorage, restore sessions on reload
- **Keyboard shortcuts** - Quick actions for power users
- **Responsive design** - Works on desktop and mobile

## Tech Stack

- Svelte 4 - Frontend framework
- TypeScript - Type-safe JavaScript
- Vite - Build tool and dev server
- Marked - Markdown parser
- highlight.js - Syntax highlighting
- lucide-svelte - Icons

## Installation

**Prerequisites:** Node.js v16+ and npm/yarn

```bash
# Clone the repository
git clone https://github.com/yourusername/aire.git

# Navigate to the project directory
cd aire

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`

**Build for production:**

```bash
npm run build
npm run preview
```

## Usage

- **Create document** - Click the + button or press `Ctrl+N` (`Cmd+N` on Mac)
- **Edit** - Type markdown in the left pane, see preview on the right
- **Rename tab** - Double-click the tab
- **Close tab** - Click the × button
- **Download** - Press `Ctrl+S` (`Cmd+S` on Mac) to save as .md file
- **Toggle theme** - Press `Ctrl+D` (`Cmd+D` on Mac) or click the theme button

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | Create new document |
| `Ctrl + S` | Download current document |
| `Ctrl + D` | Toggle light/dark theme |
| `Ctrl + W` | Toggle word wrap |

On macOS, use `Cmd` instead of `Ctrl`.

## License

This project is licensed under the **GPL v3 License**. See the [LICENSE](LICENSE) file for details.
