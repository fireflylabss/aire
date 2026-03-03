# ✨ Aire

> A modern, fluid markdown editor built with Svelte. Experience the joy of writing with live preview, beautiful syntax highlighting, and a distraction-free interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-4.0-orange?logo=svelte)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-latest-purple?logo=vite)](https://vitejs.dev)

---

## 📸 Screenshots

<div align="center">

| Light Theme | Dark Theme |
|-------------|------------|
| ![Light Theme](docs/screenshot-light.png) | ![Dark Theme](docs/screenshot-dark.png) |

</div>

---

## 🚀 Features

### 📝 **Modern Markdown Editing**
- Clean, distraction-free writing interface
- Full **GitHub Flavored Markdown** support
  - Tables
  - Task lists
  - Strikethrough text
  - And much more!

### 👁️ **Live Preview**
- Real-time rendered preview with split-pane view
- Draggable pane resizer for custom layout
- Synchronized scrolling between editor and preview

### 🎨 **Beautiful Syntax Highlighting**
- Powered by **highlight.js**
- Support for **100+ programming languages**
- Automatic language detection

### 📑 **Multi-Document Support**
- Work with multiple tabs/documents simultaneously
- Double-click to rename tabs
- Easy tab management

### 🌓 **Themes**
- Light & Dark themes
- One-click theme toggle
- Persistent theme preference

### 💾 **Auto-Save**
- Automatic saving to **localStorage**
- Never lose your work
- Restore sessions on page reload

### ⌨️ **Keyboard Shortcuts**
- Productive shortcuts for power users
- Quick actions without leaving the keyboard

### 📱 **Responsive Design**
- Works beautifully on desktop and mobile
- Adaptive layout for any screen size

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Svelte 4](https://svelte.dev) | Frontend framework |
| [TypeScript](https://www.typescriptlang.org) | Type-safe JavaScript |
| [Vite](https://vitejs.dev) | Build tool & dev server |
| [Marked](https://marked.js.org) | Markdown parser |
| [highlight.js](https://highlightjs.org) | Syntax highlighting |
| [lucide-svelte](https://lucide.dev) | Beautiful icons |

---

## 📦 Installation

### Prerequisites
- [Node.js](https://nodejs.org) (v16 or higher)
- npm or yarn

### Quick Start

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

### Build for Production

```bash
# Create optimized production build
npm run build

# Preview the production build locally
npm run preview
```

---

## 📖 Usage

### Creating Documents
- Click the **+** button to create a new document
- Or use the keyboard shortcut `Ctrl+N` (or `Cmd+N` on Mac)

### Editing
- Type your markdown in the left pane
- See live preview in the right pane
- Drag the resizer to adjust pane widths

### Managing Tabs
- **Double-click** a tab to rename it
- Click **×** to close a tab
- Switch between tabs by clicking on them

### Downloading
- Press `Ctrl+S` (or `Cmd+S` on Mac) to download your markdown file
- Files are saved with `.md` extension

### Themes
- Press `Ctrl+D` (or `Cmd+D` on Mac) to toggle between Light and Dark themes
- Or click the theme toggle button in the toolbar

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | Create new document |
| `Ctrl + S` | Download current document |
| `Ctrl + D` | Toggle light/dark theme |

> **Note:** On macOS, use `Cmd` instead of `Ctrl`

---

## 🏗️ Development

### Project Structure

```
aire/
├── src/
│   ├── components/     # Svelte components
│   ├── lib/           # Utility functions
│   ├── stores/        # Svelte stores
│   ├── styles/        # Global styles
│   └── App.svelte     # Root component
├── public/            # Static assets
├── docs/              # Documentation & screenshots
├── index.html         # Entry HTML file
├── vite.config.ts     # Vite configuration
├── tsconfig.json      # TypeScript configuration
└── package.json       # Dependencies & scripts
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run check` | Type-check TypeScript |
| `npm run lint` | Run ESLint |

### Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 Markdown Support

Aire supports all standard Markdown features plus GitHub Flavored Markdown:

### Basic Syntax

```markdown
# Heading 1
## Heading 2
### Heading 3

**Bold text**
*Italic text*
~~Strikethrough~~

- Bullet list
- Another item
  - Nested item

1. Numbered list
2. Another item

[Link text](https://example.com)
![Alt text](image.png)

> Blockquote

`inline code`
```

### GitHub Flavored Markdown

```markdown
| Table | Column |
|-------|--------|
| Row 1 | Data   |
| Row 2 | Data   |

- [x] Completed task
- [ ] Incomplete task

~~Strikethrough text~~
```

### Code Blocks with Syntax Highlighting

````markdown
```javascript
function hello() {
  console.log('Hello, Aire!');
}
```

```python
def hello():
    print("Hello, Aire!")
```
````

---

## 🐛 Troubleshooting

### Common Issues

**Preview not updating?**
- Check that your markdown syntax is valid
- Try refreshing the page (auto-save will restore your work)

**LocalStorage full?**
- Close some tabs to free up space
- Download and backup your documents regularly

**Theme not persisting?**
- Check browser localStorage permissions
- Clear site data and try again

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Svelte](https://svelte.dev) - The magical disappearing UI framework
- [Marked](https://marked.js.org) - Fast markdown parser
- [highlight.js](https://highlightjs.org) - Syntax highlighting done right
- [lucide-svelte](https://lucide.dev) - Beautiful open-source icons

---

<div align="center">

**Made with ❤️ and ☕**

[Report Bug](../../issues) · [Request Feature](../../issues) · [Discussions](../../discussions)

</div>
