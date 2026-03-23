<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { marked } from 'marked';
  import { markedHighlight } from 'marked-highlight';
  import hljs from 'highlight.js';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';
  import 'emoji-picker-element';
  import { 
    Plus, 
    X, 
    Sun, 
    Moon, 
    Download, 
    FileText,
    WrapText,
    Search,
    Upload,
    FileUp,
    FileDown,
    Bold,
    Italic,
    Code,
    Link2,
    Heading1,
    Heading2,
    Heading3,
    Subscript,
    Superscript,
    List,
    ListOrdered,
    ListTodo,
    Quote,

    Strikethrough,
    Table2,
    ImagePlus,
    SquareCode,
    Minus,
    Smile,
    Ellipsis,
    ScanText,
    Underline,
    Maximize,
    Minimize,
    Eye,
    Columns,
    PenLine
  } from 'lucide-svelte';
  import { appStore, activeDocument } from './stores';
  import type { Document } from './stores';

  type PaletteCommand = {
    id: string;
    label: string;
    desc: string;
    run: () => void;
  };
  
  // ============================================
  // MARKED CONFIGURATION
  // ============================================

  // Extension: definitional lists (Term + ": definition")
  const definitionListExtension = {
    name: 'definitionList',
    level: 'block',
    start(src: string) {
      return src.match(/^\S[^\n]*\n: /m)?.index ?? -1;
    },
    tokenizer(src: string) {
      const rule = /^(?<body>(?:\S[^\n]*\n: .+(?:\n|$))+)/;
      const match = rule.exec(src);
      if (!match?.groups?.body) return;

      const items: { term: string; description: string }[] = [];
      const lines = match.groups.body.trimEnd().split(/\n/);
      for (let i = 0; i < lines.length; i++) {
        const term = lines[i];
        const descLine = lines[i + 1];
        if (!descLine?.startsWith(': ')) continue;
        items.push({ term: term.trim(), description: descLine.replace(/^: /, '').trim() });
        i++; // skip description line
      }

      return {
        type: 'definitionList',
        raw: match.groups.body,
        items,
      } as const;
    },
    renderer(token) {
      const { items } = token as { items: { term: string; description: string }[] };
      const rendered = items
        .map((item) => `<dt>${item.term}</dt><dd>${item.description}</dd>`)
        .join('');
      return `<dl>${rendered}</dl>`;
    },
  } as const;

  // Extension: callouts :::type Optional title\ncontent\n:::
  const calloutTypes = ['info', 'warn', 'warning', 'error', 'success', 'tip'];
  const calloutExtension = {
    name: 'callout',
    level: 'block',
    start(src: string) {
      return src.match(/^:::/m)?.index ?? -1;
    },
    tokenizer(src: string) {
      const rule = /^:::(?<type>\w+)(?:\s+(?<title>[^\n]+))?\n(?<body>[\s\S]+?)\n:::\s*(?:\n|$)/;
      const match = rule.exec(src);
      if (!match?.groups?.type || !match.groups.body) return;
      const type = match.groups.type.toLowerCase();
      if (!calloutTypes.includes(type)) return;

      return {
        type: 'callout',
        raw: match[0],
        calloutType: type,
        title: match.groups.title?.trim() || type.toUpperCase(),
        text: this.lexer.inlineTokens(match.groups.body.trim()),
      } as const;
    },
    renderer(token) {
      const { calloutType, title, text } = token as {
        calloutType: string;
        title: string;
        text: marked.TokensList;
      };
      const inner = this.parser.parseInline(text);
      return `<div class="callout ${calloutType}"><div class="callout-title">${title}</div><div class="callout-body">${inner}</div></div>`;
    },
  } as const;

  // Extension: math (inline $...$ and block $$...$$) rendered with KaTeX
  const inlineMathExtension = {
    name: 'inlineMath',
    level: 'inline',
    start(src: string) {
      return src.indexOf('$');
    },
    tokenizer(src: string) {
      const rule = /^\$(.+?)\$/;
      const match = rule.exec(src);
      if (!match) return;
      if (!match[1].trim()) return;

      return {
        type: 'inlineMath',
        raw: match[0],
        text: match[1].trim(),
      } as const;
    },
    renderer(token) {
      const { text } = token as { text: string };
      return katex.renderToString(text, { throwOnError: false, displayMode: false });
    },
  } as const;

  const blockMathExtension = {
    name: 'blockMath',
    level: 'block',
    start(src: string) {
      return src.match(/^\$\$/m)?.index ?? -1;
    },
    tokenizer(src: string) {
      const rule = /^\$\$\s*\n?([\s\S]+?)\n?\$\$\s*(?:\n|$)/;
      const match = rule.exec(src);
      if (!match?.[1]) return;

      return {
        type: 'blockMath',
        raw: match[0],
        text: match[1].trim(),
      } as const;
    },
    renderer(token) {
      const { text } = token as { text: string };
      const html = katex.renderToString(text, { throwOnError: false, displayMode: true });
      return `<div class="math-block">${html}</div>`;
    },
  } as const;

  marked.use({ extensions: [definitionListExtension, calloutExtension, blockMathExtension, inlineMathExtension] });

  marked.use(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    })
  );
  
  // Configure marked for GFM
  marked.setOptions({
    gfm: true,
    breaks: true,
    pedantic: false,
    async: false,
  });
  
  // ============================================
  // STATE
  // ============================================
  
  let editorTextarea: HTMLTextAreaElement;
  let lineNumbersEl: HTMLDivElement;
  let previewContainer: HTMLDivElement;
  let editingNameId: string | null = null;
  let editingNameValue = '';
  let isResizing = false;
  let sidebarWidth = 50;

  let liveMessage = '';
  let showPalette = false;
  let paletteFilter = '';
  let filteredCommands: PaletteCommand[] = [];
  let paletteInputEl: HTMLInputElement | null = null;
  let selectionLength = 0;
  let caretLine = 1;
  let caretCol = 1;
  let showSearchPanel = false;
  let searchQuery = '';
  let replaceQuery = '';
  let isFullscreen = false;
  let showTableMenu = false;
  let tableAnchorEl: HTMLButtonElement | null = null;
  let tableHoverRows = 0;
  let tableHoverCols = 0;
  let tableMenuStyle = 'top: 32px; left: 6px;';
  let showEmojiMenu = false;
  let emojiAnchorEl: HTMLButtonElement | null = null;
  let emojiMenuStyle = 'top: 32px; left: 6px;';
  let showToolbarOverflowMenu = false;
  let overflowAnchorEl: HTMLButtonElement | null = null;
  let overflowMenuStyle = 'top: 32px; right: 6px;';
  let showImportMenu = false;
  let importMenuAnchorEl: HTMLButtonElement | null = null;
  let importMenuStyle = 'top: 32px; left: 6px;';
  let showExportMenu = false;
  let exportMenuAnchorEl: HTMLButtonElement | null = null;
  let exportMenuStyle = 'top: 32px; left: 6px;';
  let formatToolbarEl: HTMLDivElement | null = null;
  let toolbarHostEl: HTMLDivElement | null = null;
  let importInputEl: HTMLInputElement | null = null;
  let isEditorDragOver = false;
  let viewMode: 'write' | 'preview' | 'split' = 'split';
  let uiZoom = 100;
  let showMobileDevNotice = false;
  const MAX_TABS_PER_WORKSPACE = 32;

  const editorStateByDoc = new Map<string, { selectionStart: number; selectionEnd: number; scrollTop: number }>();
  const previewScrollByDoc = new Map<string, number>();
  
  $: currentDoc = $activeDocument;
  $: visibleDocuments = $appStore.documents;
  $: workspaceTabCount = visibleDocuments.length;
  $: canCreateMoreTabs = workspaceTabCount < MAX_TABS_PER_WORKSPACE;
  $: renderedMarkdown = currentDoc ? (marked.parse(currentDoc.content) as string) : '';
  $: lineCount = currentDoc ? currentDoc.content.split('\n').length : 1;
  $: searchResults = searchQuery.trim()
    ? $appStore.documents
        .filter((doc) => doc.content.toLowerCase().includes(searchQuery.toLowerCase()) || doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          matches: (doc.content.match(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length,
        }))
    : [];
  $: 
    if ($appStore) {
      sidebarWidth = $appStore.sidebarWidth;
    }

  $: filteredCommands = paletteCommands.filter((cmd) =>
    `${cmd.label} ${cmd.desc}`.toLowerCase().includes(paletteFilter.toLowerCase())
  );

  $: wordCount = currentDoc ? (currentDoc.content.trim() ? currentDoc.content.trim().split(/\s+/).length : 0) : 0;

  $: if (previewContainer && renderedMarkdown) {
    tick().then(() => {
      enhancePreviewBlocks();
    });
  }

  $: if (currentDoc) {
    // Restore editor/preview positions when switching docs
    tick().then(() => {
      restoreEditorState(currentDoc);
    });
  }

  const paletteCommands: PaletteCommand[] = [
    { id: 'new', label: 'New document', desc: 'Create empty doc', run: handleNewDocument },
    { id: 'download', label: 'Download markdown', desc: 'Save current doc', run: handleDownload },
    { id: 'toggle-theme', label: 'Toggle theme', desc: 'Light/Dark', run: () => appStore.toggleTheme() },
    { id: 'toggle-wrap', label: 'Toggle word wrap', desc: 'Wrap editor lines', run: () => appStore.toggleWordWrap() },
    { id: 'focus-editor', label: 'Focus editor', desc: 'Move caret to editor', run: () => editorTextarea?.focus() },
    { id: 'search', label: 'Global search', desc: 'Search across documents', run: () => (showSearchPanel = true) },
    { id: 'export-html', label: 'Export HTML', desc: 'Save rendered document as HTML', run: handleExportHtml },
    { id: 'export-pdf', label: 'Export PDF', desc: 'Print rendered document to PDF', run: handleExportPdf },
    { id: 'zoom-in', label: 'Zoom in', desc: 'Increase editor + preview scale', run: zoomIn },
    { id: 'zoom-out', label: 'Zoom out', desc: 'Decrease editor + preview scale', run: zoomOut },
    { id: 'zoom-reset', label: 'Reset zoom', desc: 'Back to 100%', run: resetZoom },
  ];

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Palette helpers
  function openPalette() {
    showPalette = true;
    paletteFilter = '';
    tick().then(() => paletteInputEl?.focus());
  }

  function closePalette() {
    showPalette = false;
    paletteFilter = '';
  }

  function runPaletteCommand(cmd: PaletteCommand) {
    closePalette();
    cmd.run();
  }

  function handlePaletteKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = filteredCommands[0];
      if (first) runPaletteCommand(first);
    }
  }

  function handlePaletteInput(e: Event) {
    const target = e.target as HTMLInputElement | null;
    paletteFilter = target?.value ?? '';
  }

  // Paste handler: insert pasted images as markdown references
  function handlePaste(e: ClipboardEvent) {
    if (!currentDoc || !editorTextarea) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const url = URL.createObjectURL(file);
        const label = `pasted-image-${Date.now()}`;

        const { selectionStart, selectionEnd, value } = editorTextarea;
        const before = value.slice(0, selectionStart ?? 0);
        const after = value.slice(selectionEnd ?? selectionStart ?? 0);
        const insertion = `![${label}](${url})`;

        const updated = `${before}${insertion}${after}`;
        appStore.updateDocumentContent(currentDoc.id, updated);

        tick().then(() => {
          const caret = (selectionStart ?? 0) + insertion.length;
          editorTextarea.selectionStart = caret;
          editorTextarea.selectionEnd = caret;
        });
        break;
      }
    }
  }

  // Format markdown tables in current document
  function handleFormatTables() {
    if (!currentDoc) return;
    const formatted = formatTables(currentDoc.content);
    appStore.updateDocumentContent(currentDoc.id, formatted);
    announce('Tables formatted');
  }

  function formatTables(markdown: string): string {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const isTableRow = line.includes('|');
      if (!isTableRow) {
        result.push(line);
        i += 1;
        continue;
      }

      // Collect consecutive lines that look like table rows
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }

      if (tableLines.length < 2 || !tableLines[1].match(/^-{3,}|\|\s*-{3,}/)) {
        result.push(...tableLines);
        continue;
      }

      // Split into cells and compute column widths
      const rows = tableLines.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const colCount = Math.max(...rows.map((r) => r.length));
      const widths = new Array(colCount).fill(0);
      rows.forEach((r) => {
        for (let c = 0; c < colCount; c++) {
          const cell = r[c] ?? '';
          widths[c] = Math.max(widths[c], cell.length);
        }
      });

      // Rebuild rows
      const formattedRows = rows.map((r, idx) => {
        const padded = widths.map((w, c) => {
          const cell = r[c] ?? '';
          return cell.padEnd(w, ' ');
        });
        return `| ${padded.join(' | ')} |`;
      });

      // Ensure separator row has dashes sized to column width
      if (formattedRows.length >= 2) {
        const sepCells = widths.map((w) => '-'.repeat(Math.max(3, w)));
        formattedRows[1] = `| ${sepCells.join(' | ')} |`;
      }

      result.push(...formattedRows);
    }

    return result.join('\n');
  }

  function saveEditorState(doc: Document | null) {
    if (!doc || !editorTextarea) return;
    editorStateByDoc.set(doc.id, {
      selectionStart: editorTextarea.selectionStart ?? 0,
      selectionEnd: editorTextarea.selectionEnd ?? 0,
      scrollTop: editorTextarea.scrollTop,
    });
    if (previewContainer) {
      previewScrollByDoc.set(doc.id, previewContainer.scrollTop);
    }
  }

  function restoreEditorState(doc: Document | null) {
    if (!doc || !editorTextarea) return;
    const state = editorStateByDoc.get(doc.id);
    const previewScroll = previewScrollByDoc.get(doc.id);
    if (!state && previewScroll === undefined) return;

    editorTextarea.selectionStart = state?.selectionStart ?? 0;
    editorTextarea.selectionEnd = state?.selectionEnd ?? 0;
    editorTextarea.scrollTop = state?.scrollTop ?? 0;
    if (previewContainer && previewScroll !== undefined) {
      previewContainer.scrollTop = previewScroll;
    }
    handleSelectionChange();
  }

  function announce(message: string) {
    liveMessage = '';
    tick().then(() => {
      liveMessage = message;
    });
  }

  function enhancePreviewBlocks() {
    if (!previewContainer) return;
    const codes = previewContainer.querySelectorAll('pre > code');

    codes.forEach((code) => {
      const pre = code.parentElement as HTMLElement | null;
      if (!pre || pre.dataset.enhanced === 'true') return;

      pre.dataset.enhanced = 'true';
      pre.classList.add('code-block');
      const lines = (code.textContent || '').split('\n').length;
      
      // Force vertical scroll propagation for Webviews where code blocks swallow wheel events
      pre.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          if (previewContainer) {
            previewContainer.scrollTop += e.deltaY;
          }
        }
      }, { passive: false });

      // Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'code-toolbar';

      // Copy button
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-action copy';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || '');
          const prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = prev), 1400);
        } catch (err) {
          console.error('Copy failed', err);
        }
      });
      toolbar.appendChild(copyBtn);



      pre.insertBefore(toolbar, code);
    });

    // Make task-list checkboxes interactive (sync back to markdown)
    const checkboxes = previewContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-task-list-item]');
    checkboxes.forEach((checkbox) => {
      if (checkbox.dataset.bound === 'true') return;
      checkbox.dataset.bound = 'true';
      checkbox.addEventListener('change', () => {
        if (!currentDoc) return;
        const { selectionStart, selectionEnd, scrollTop } = editorTextarea ?? { selectionStart: 0, selectionEnd: 0, scrollTop: 0 };
        const lines = currentDoc.content.split('\n');
        const lineIndex = Array.from(previewContainer.querySelectorAll('input[type="checkbox"][data-task-list-item]')).indexOf(checkbox);
        if (lineIndex < 0) return;

        let taskCounter = -1;
        const updatedLines = lines.map((line) => {
          if (!line.match(/^\s*[-*]\s+\[( |x|X)\]/)) return line;
          taskCounter += 1;
          if (taskCounter !== lineIndex) return line;
          return line.replace(/^(\s*[-*]\s+\[)( |x|X)(\])/, `$1${checkbox.checked ? 'x' : ' '}$3`);
        });

        appStore.updateDocumentContent(currentDoc.id, updatedLines.join('\n'));
        tick().then(() => {
          if (!editorTextarea) return;
          editorTextarea.selectionStart = selectionStart ?? 0;
          editorTextarea.selectionEnd = selectionEnd ?? 0;
          editorTextarea.scrollTop = scrollTop ?? 0;
        });
      });
    });
  }
  
  // Apply theme to body
  $: {
    if (typeof document !== 'undefined') {
      if ($appStore.theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
  }
  
  // ============================================
  // HANDLERS
  // ============================================
  
  function handleContentChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    if (currentDoc) {
      appStore.updateDocumentContent(currentDoc.id, target.value);
    }
    handleSelectionChange();
  }
  
  function handleNewDocument() {
    if (!canCreateMoreTabs) {
      announce(`Tab limit reached (${MAX_TABS_PER_WORKSPACE})`);
      return;
    }
    const docCount = workspaceTabCount;
    const newName = docCount === 0 ? 'Untitled' : `Untitled ${docCount + 1}`;
    const newId = appStore.createDocument(newName, '');
    if (!newId) {
      announce(`Tab limit reached (${MAX_TABS_PER_WORKSPACE})`);
      return;
    }
    announce(`Document ${newName} created`);
    
    // Focus editor after creation
    tick().then(() => {
      editorTextarea?.focus();
    });
  }
  
  function handleCloseDocument(e: MouseEvent, id: string) {
    e.stopPropagation();
    
    if ($appStore.documents.length === 1) {
      // Don't delete the last document, just clear it
      appStore.updateDocumentContent(id, '');
      appStore.renameDocument(id, 'Untitled');
    } else {
      appStore.deleteDocument(id);
    }
  }
  
  function handleTabClick(id: string) {
    saveEditorState(currentDoc);
    appStore.setActiveDocument(id);
  }
  
  function startEditingName(doc: Document) {
    editingNameId = doc.id;
    editingNameValue = doc.name;
    
    tick().then(() => {
      const input = document.getElementById(`rename-input-${doc.id}`) as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }
  
  function finishEditingName() {
    if (editingNameId && editingNameValue.trim()) {
      appStore.renameDocument(editingNameId, editingNameValue.trim());
    }
    editingNameId = null;
    editingNameValue = '';
  }
  
  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      finishEditingName();
    } else if (e.key === 'Escape') {
      editingNameId = null;
      editingNameValue = '';
    }
  }
  
  function handleDownload() {
    if (!currentDoc) return;
    
    const blob = new Blob([currentDoc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDoc.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    announce(`Document ${currentDoc.name} downloaded`);
  }

  function buildExportHtml(content: string, title: string) {
    const previewHtml = marked.parse(content) as string;
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>body{font-family:Inter,system-ui,sans-serif;margin:2rem;color:#111}main{max-width:860px;margin:0 auto}pre{background:#f4f4f4;padding:1rem;border-radius:8px;overflow:auto}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.5rem}.callout{border-left:4px solid #4f46e5;padding:.75rem 1rem;background:#f8f8ff}@media print{body{margin:0.5in}}</style></head><body><main>${previewHtml}</main></body></html>`;
  }

  function handleExportHtml() {
    if (!currentDoc) return;
    const html = buildExportHtml(currentDoc.content, currentDoc.name);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDoc.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    announce('HTML exported');
  }

  function handleExportPdf() {
    if (!currentDoc) return;
    const html = buildExportHtml(currentDoc.content, currentDoc.name);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 200);
    announce('PDF export opened');
  }

  function handleReplaceAll() {
    if (!searchQuery.trim()) return;
    const regex = new RegExp(escapeRegExp(searchQuery), 'gi');
    for (const doc of $appStore.documents) {
      if (!doc.content.match(regex)) continue;
      appStore.updateDocumentContent(doc.id, doc.content.replace(regex, replaceQuery));
    }
    announce('Replace applied across documents');
  }

  function jumpToSearchResult(docId: string) {
    const target = $appStore.documents.find((doc) => doc.id === docId);
    if (!target) return;
    appStore.setActiveDocument(target.id);
    showSearchPanel = false;
  }

  function wrapSelection(prefix: string, suffix = prefix, placeholder = 'text') {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const selected = currentDoc.content.slice(start, end) || placeholder;
    const updated = `${currentDoc.content.slice(0, start)}${prefix}${selected}${suffix}${currentDoc.content.slice(end)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      const newStart = start + prefix.length;
      const newEnd = newStart + selected.length;
      editorTextarea.focus();
      editorTextarea.selectionStart = newStart;
      editorTextarea.selectionEnd = newEnd;
      handleSelectionChange();
    });
  }

  function insertAtCursor(snippet: string) {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const updated = `${currentDoc.content.slice(0, start)}${snippet}${currentDoc.content.slice(end)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      const caret = start + snippet.length;
      editorTextarea.focus();
      editorTextarea.selectionStart = caret;
      editorTextarea.selectionEnd = caret;
      handleSelectionChange();
    });
  }

  function replaceSelection(snippet: string) {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const updated = `${currentDoc.content.slice(0, start)}${snippet}${currentDoc.content.slice(end)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      const caret = start + snippet.length;
      editorTextarea.focus();
      editorTextarea.selectionStart = caret;
      editorTextarea.selectionEnd = caret;
      handleSelectionChange();
    });
  }

  function applyPrefixToSelectedLines(prefix: string) {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const text = currentDoc.content;
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextNewline = text.indexOf('\n', end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const block = text.slice(lineStart, lineEnd);
    const updatedBlock = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    const updated = `${text.slice(0, lineStart)}${updatedBlock}${text.slice(lineEnd)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      editorTextarea.focus();
      editorTextarea.selectionStart = lineStart;
      editorTextarea.selectionEnd = lineStart + updatedBlock.length;
      handleSelectionChange();
    });
  }

  function applyOrderedList() {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const text = currentDoc.content;
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextNewline = text.indexOf('\n', end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const block = text.slice(lineStart, lineEnd);
    const updatedBlock = block
      .split('\n')
      .map((line, idx) => `${idx + 1}. ${line}`)
      .join('\n');
    const updated = `${text.slice(0, lineStart)}${updatedBlock}${text.slice(lineEnd)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      editorTextarea.focus();
      editorTextarea.selectionStart = lineStart;
      editorTextarea.selectionEnd = lineStart + updatedBlock.length;
      handleSelectionChange();
    });
  }

  function insertHeading(level: 1 | 2 | 3) {
    const prefix = '#'.repeat(level) + ' ';
    applyPrefixToSelectedLines(prefix);
  }

  function insertHorizontalRule() {
    insertAtCursor('\n---\n');
  }

  function insertCodeBlock() {
    if (!currentDoc || !editorTextarea) return;
    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const selected = currentDoc.content.slice(start, end).trim();
    const snippet = selected ? `\n\`\`\`text\n${selected}\n\`\`\`\n` : '\n```text\ncode\n```\n';
    replaceSelection(snippet);
  }

  function insertInlineCode() {
    wrapSelection('`', '`', 'code');
  }

  function normalizeUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function isLikelyUrl(value: string) {
    return /^(https?:\/\/|www\.)\S+$/i.test(value.trim());
  }

  function insertImageSnippet() {
    const selected = currentDoc && editorTextarea
      ? currentDoc.content.slice(editorTextarea.selectionStart ?? 0, editorTextarea.selectionEnd ?? 0).trim()
      : '';
    const alt = (window.prompt('Image alt text', selected || 'image') || 'image').trim();
    const rawUrl = (window.prompt('Image URL', 'https://') || '').trim();
    if (!rawUrl) return;
    replaceSelection(`![${alt}](${normalizeUrl(rawUrl)})`);
  }

  function insertLinkSnippet() {
    const selected = currentDoc && editorTextarea
      ? currentDoc.content.slice(editorTextarea.selectionStart ?? 0, editorTextarea.selectionEnd ?? 0).trim()
      : '';
    const label = (selected || window.prompt('Link text', 'link') || 'link').trim();
    const rawUrl = (window.prompt('Link URL', 'https://') || '').trim();
    if (!rawUrl) return;
    replaceSelection(`[${label}](${normalizeUrl(rawUrl)})`);
  }

  function formatUrlAction() {
    const selected = currentDoc && editorTextarea
      ? currentDoc.content.slice(editorTextarea.selectionStart ?? 0, editorTextarea.selectionEnd ?? 0).trim()
      : '';
    if (selected && isLikelyUrl(selected)) {
      const label = (window.prompt('Link text', 'link') || 'link').trim();
      replaceSelection(`[${label}](${normalizeUrl(selected)})`);
      return;
    }
    const rawUrl = (window.prompt('URL to format', selected && !isLikelyUrl(selected) ? selected : 'https://') || '').trim();
    if (!rawUrl) return;
    const normalized = normalizeUrl(rawUrl);
    const fallbackLabel = selected && !isLikelyUrl(selected) ? selected : 'link';
    const label = (window.prompt('Label', fallbackLabel) || fallbackLabel).trim() || 'link';
    replaceSelection(`[${label}](${normalized})`);
  }

  function buildTable(rows: number, cols: number) {
    const header = `| ${Array.from({ length: cols }, (_, idx) => `Col ${idx + 1}`).join(' | ')} |`;
    const separator = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
    const body = Array.from({ length: Math.max(0, rows - 1) }, () => `| ${Array.from({ length: cols }, () => ' ').join(' | ')} |`);
    return [header, separator, ...body].join('\n');
  }

  function insertTable(rows: number, cols: number) {
    const snippet = `\n${buildTable(rows, cols)}\n`;
    replaceSelection(snippet);
    showTableMenu = false;
    tableHoverRows = 0;
    tableHoverCols = 0;
  }

  function popoverStyleForAnchor(anchorEl: HTMLElement | null, containerEl: HTMLElement | null, width = 260) {
    if (!containerEl || !anchorEl) return 'top: 32px; left: 6px;';
    const toolbarRect = containerEl.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const top = anchorRect.bottom - toolbarRect.top + 4;
    const maxLeft = Math.max(6, toolbarRect.width - width - 6);
    const left = Math.max(6, Math.min(maxLeft, anchorRect.left - toolbarRect.left));
    return `top: ${top}px; left: ${left}px;`;
  }

  function openTableMenu() {
    showEmojiMenu = false;
    showToolbarOverflowMenu = false;
    showImportMenu = false;
    showExportMenu = false;
    tableMenuStyle = popoverStyleForAnchor(tableAnchorEl, formatToolbarEl, 236);
    showTableMenu = !showTableMenu;
  }

  function openEmojiMenu() {
    showTableMenu = false;
    showToolbarOverflowMenu = false;
    showImportMenu = false;
    showExportMenu = false;
    emojiMenuStyle = popoverStyleForAnchor(emojiAnchorEl, formatToolbarEl, 336);
    showEmojiMenu = !showEmojiMenu;
  }

  function toggleToolbarOverflow() {
    showTableMenu = false;
    showEmojiMenu = false;
    showImportMenu = false;
    showExportMenu = false;
    overflowMenuStyle = popoverStyleForAnchor(overflowAnchorEl, formatToolbarEl, 310);
    showToolbarOverflowMenu = !showToolbarOverflowMenu;
  }

  function toggleImportMenu() {
    showTableMenu = false;
    showEmojiMenu = false;
    showToolbarOverflowMenu = false;
    showExportMenu = false;
    importMenuStyle = popoverStyleForAnchor(importMenuAnchorEl, formatToolbarEl, 220);
    showImportMenu = !showImportMenu;
  }

  function toggleExportMenu() {
    showTableMenu = false;
    showEmojiMenu = false;
    showToolbarOverflowMenu = false;
    showImportMenu = false;
    exportMenuStyle = popoverStyleForAnchor(exportMenuAnchorEl, formatToolbarEl, 220);
    showExportMenu = !showExportMenu;
  }

  function handleEmojiPicked(event: Event) {
    const custom = event as CustomEvent<{ unicode?: string }>;
    const emoji = custom.detail?.unicode;
    if (!emoji) return;
    replaceSelection(emoji);
    showEmojiMenu = false;
  }

  function handleImportFiles(e: Event) {
    const input = e.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);
    if (files.length === 0) return;
    const availableSlots = Math.max(0, MAX_TABS_PER_WORKSPACE - workspaceTabCount);
    if (availableSlots === 0) {
      if (input) input.value = '';
      announce(`Tab limit reached (${MAX_TABS_PER_WORKSPACE})`);
      return;
    }
    files.slice(0, availableSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        appStore.createDocument(file.name.replace(/\.md$/i, ''), String(reader.result || ''));
      };
      reader.readAsText(file);
    });
    if (input) input.value = '';
    announce(`${Math.min(files.length, availableSlots)} file(s) queued for import`);
  }

  function handleDropImport(e: DragEvent) {
    e.preventDefault();
    isEditorDragOver = false;
    const files = Array.from(e.dataTransfer?.files || []).filter((file) => file.name.toLowerCase().endsWith('.md'));
    const availableSlots = Math.max(0, MAX_TABS_PER_WORKSPACE - workspaceTabCount);
    if (availableSlots === 0) {
      announce(`Tab limit reached (${MAX_TABS_PER_WORKSPACE})`);
      return;
    }
    files.slice(0, availableSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        appStore.createDocument(file.name.replace(/\.md$/i, ''), String(reader.result || ''));
      };
      reader.readAsText(file);
    });
    if (files.length > 0) announce(`${Math.min(files.length, availableSlots)} markdown file(s) imported`);
  }

  function zoomIn() {
    uiZoom = Math.min(170, uiZoom + 10);
    announce(`Zoom ${uiZoom}%`);
  }

  function zoomOut() {
    uiZoom = Math.max(70, uiZoom - 10);
    announce(`Zoom ${uiZoom}%`);
  }

  function resetZoom() {
    uiZoom = 100;
    announce('Zoom 100%');
  }
  
  // Sync scroll between editor and line numbers
  function handleEditorScroll() {
    if (lineNumbersEl && editorTextarea) {
      lineNumbersEl.scrollTop = editorTextarea.scrollTop;
    }
  }

  function handleSelectionChange() {
    if (!editorTextarea) return;
    const { selectionStart = 0, selectionEnd = 0 } = editorTextarea;
    selectionLength = Math.abs(selectionEnd - selectionStart);
    const pos = selectionStart;
    const text = currentDoc?.content ?? '';
    const before = text.slice(0, pos);
    const lines = before.split('\n');
    caretLine = lines.length;
    caretCol = lines[lines.length - 1]?.length + 1 || 1;
  }

  function handleEditorKeydown(e: KeyboardEvent) {
    if (!currentDoc || !editorTextarea) return;
    if (e.key !== 'Tab') return;
    e.preventDefault();

    const start = editorTextarea.selectionStart ?? 0;
    const end = editorTextarea.selectionEnd ?? 0;
    const text = currentDoc.content;
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextNewline = text.indexOf('\n', end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;

    // Single caret: insert tab / remove one indent level.
    if (start === end) {
      if (e.shiftKey) {
        const beforeLine = text.slice(lineStart, start);
        if (beforeLine.endsWith('\t')) {
          const updated = `${text.slice(0, start - 1)}${text.slice(end)}`;
          appStore.updateDocumentContent(currentDoc.id, updated);
          tick().then(() => {
            const pos = start - 1;
            editorTextarea.selectionStart = pos;
            editorTextarea.selectionEnd = pos;
            handleSelectionChange();
          });
          return;
        }
        if (beforeLine.endsWith('  ')) {
          const updated = `${text.slice(0, start - 2)}${text.slice(end)}`;
          appStore.updateDocumentContent(currentDoc.id, updated);
          tick().then(() => {
            const pos = start - 2;
            editorTextarea.selectionStart = pos;
            editorTextarea.selectionEnd = pos;
            handleSelectionChange();
          });
          return;
        }
        return;
      }
      const updated = `${text.slice(0, start)}\t${text.slice(end)}`;
      appStore.updateDocumentContent(currentDoc.id, updated);
      tick().then(() => {
        const pos = start + 1;
        editorTextarea.selectionStart = pos;
        editorTextarea.selectionEnd = pos;
        handleSelectionChange();
      });
      return;
    }

    // Multi-line selection: indent/outdent all selected lines.
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const updatedLines = e.shiftKey
      ? lines.map((line) => line.replace(/^\t|^ {1,2}/, ''))
      : lines.map((line) => `\t${line}`);
    const updatedBlock = updatedLines.join('\n');
    const updated = `${text.slice(0, lineStart)}${updatedBlock}${text.slice(lineEnd)}`;
    appStore.updateDocumentContent(currentDoc.id, updated);
    tick().then(() => {
      editorTextarea.selectionStart = lineStart;
      editorTextarea.selectionEnd = lineStart + updatedBlock.length;
      handleSelectionChange();
    });
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      showSearchPanel = false;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = searchResults[0];
      if (first) jumpToSearchResult(first.id);
    }
  }
  
  // Resizer handlers
  function startResizing(e: MouseEvent) {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  
  function stopResizing() {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  
  function handleResizing(e: MouseEvent) {
    const containerWidth = window.innerWidth;
    if (isResizing) {
      const newWidth = (e.clientX / containerWidth) * 100;
      if (newWidth >= 20 && newWidth <= 80) {
        sidebarWidth = newWidth;
        appStore.setSidebarWidth(newWidth);
      }
      return;
    }
  }

  function handleGlobalClick(e: MouseEvent) {
    const target = e.target as Node | null;
    if (!target) return;
    if (showTableMenu && toolbarHostEl && !toolbarHostEl.contains(target)) {
      showTableMenu = false;
      tableHoverRows = 0;
      tableHoverCols = 0;
    }
    if (showEmojiMenu && toolbarHostEl && !toolbarHostEl.contains(target)) {
      showEmojiMenu = false;
    }
    if (showToolbarOverflowMenu && toolbarHostEl && !toolbarHostEl.contains(target)) {
      showToolbarOverflowMenu = false;
    }
    if (showImportMenu && toolbarHostEl && !toolbarHostEl.contains(target)) {
      showImportMenu = false;
    }
    if (showExportMenu && toolbarHostEl && !toolbarHostEl.contains(target)) {
      showExportMenu = false;
    }
  }
  
  // Toggle fullscreen mode
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        isFullscreen = true;
      }).catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        isFullscreen = false;
      }).catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  }
  
  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showTableMenu || showEmojiMenu || showToolbarOverflowMenu || showImportMenu || showExportMenu) {
        showTableMenu = false;
        showEmojiMenu = false;
        showToolbarOverflowMenu = false;
        showImportMenu = false;
        showExportMenu = false;
        tableHoverRows = 0;
        tableHoverCols = 0;
        e.preventDefault();
        return;
      }
      if (showSearchPanel) {
        showSearchPanel = false;
        e.preventDefault();
        return;
      }
    }

    // Ctrl/Cmd + N: New document
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      handleNewDocument();
    }
    
    // Ctrl/Cmd + S: Download (since it's auto-saved)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleDownload();
    }
    
    // Ctrl/Cmd + Shift + L: Toggle theme
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      appStore.toggleTheme();
    }
    
    // Alt + Z: Toggle word wrap (avoids browser Ctrl+W close-tab)
    if (e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      appStore.toggleWordWrap();
    }

    // Ctrl/Cmd + K: Command palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (showPalette) {
        closePalette();
      } else {
        openPalette();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      showSearchPanel = !showSearchPanel;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrapSelection('**');
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrapSelection('*');
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      wrapSelection('<u>', '</u>', 'text');
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      wrapSelection('~~', '~~', 'text');
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '7') {
      e.preventDefault();
      applyOrderedList();
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '8') {
      e.preventDefault();
      applyPrefixToSelectedLines('- ');
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === '1') {
      e.preventDefault();
      insertHeading(1);
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === '2') {
      e.preventDefault();
      insertHeading(2);
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === '3') {
      e.preventDefault();
      insertHeading(3);
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoomOut();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  }
  
  onMount(() => {
    showMobileDevNotice = window.matchMedia('(max-width: 900px)').matches;
    window.addEventListener('mousemove', handleResizing);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleKeydown);
    
    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      window.removeEventListener('mousemove', handleResizing);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  });
</script>

<main class="app-container">
  <div class="sr-only" aria-live="polite">{liveMessage}</div>
  <!-- Header / Tab Bar -->
  <header class="header">
    <div class="app-brand">Aire</div>
    <div class="tabs-container">
      <div class="tabs-scroll">
        {#each visibleDocuments as doc (doc.id)}
          <div 
            class="tab-wrapper animate-slide-in"
            class:active={doc.id === $appStore.activeDocumentId}
          >
            {#if editingNameId === doc.id}
              <input
                id="rename-input-{doc.id}"
                type="text"
                class="rename-input"
                bind:value={editingNameValue}
                on:blur={finishEditingName}
                on:keydown={handleRenameKeydown}
              />
            {:else}
              <button 
                class="tab animate-fade-in"
                class:active={doc.id === $appStore.activeDocumentId}
                on:click={() => handleTabClick(doc.id)}
                on:dblclick={() => startEditingName(doc)}
                title={doc.name}
              >
                <FileText size={14} />
                <span class="tab-name">{doc.name}</span>
                <button 
                  class="tab-close"
                  on:click={(e) => handleCloseDocument(e, doc.id)}
                  title="Close tab"
                >
                  <X size={12} />
                </button>
              </button>
            {/if}
          </div>
        {/each}
        
        <button
          class="add-tab-btn animate-fade-in"
          class:is-disabled={!canCreateMoreTabs}
          on:click={handleNewDocument}
          title={canCreateMoreTabs ? 'New document (Ctrl+N)' : `Maximum ${MAX_TABS_PER_WORKSPACE} tabs`}
          disabled={!canCreateMoreTabs}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  </header>

  {#if showMobileDevNotice}
    <div class="mobile-dev-backdrop">
      <div class="mobile-dev-modal">
        <h3>Mobile Support In Progress</h3>
        <p>The mobile experience is still being developed and may have layout issues.</p>
        <button class="btn btn-primary" on:click={() => (showMobileDevNotice = false)}>Continue Anyway</button>
      </div>
    </div>
  {/if}

  {#if currentDoc}
    <div class="toolbar-host" bind:this={toolbarHostEl}>
      <div class="format-toolbar unified-toolbar" bind:this={formatToolbarEl}>
        <div class="toolbar-main desktop-toolbar">
          <!-- Left side: Formatting controls -->
          <div class="toolbar-left">
            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('**')} title="Bold"><Bold size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('*')} title="Italic"><Italic size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('~~', '~~', 'text')} title="Strikethrough"><Strikethrough size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('<u>', '</u>', 'text')} title="Underline"><Underline size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>

            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={() => insertHeading(1)} title="Header 1"><Heading1 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => insertHeading(2)} title="Header 2"><Heading2 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => insertHeading(3)} title="Header 3"><Heading3 size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('<sub>', '</sub>', 'sub')} title="Subtext"><Subscript size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => wrapSelection('<sup>', '</sup>', 'sup')} title="Supertext"><Superscript size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>

            <div class="toolbar-group">
              <button class="toolbar-icon-btn" bind:this={tableAnchorEl} class:active-toolbar={showTableMenu} on:click={openTableMenu} title="Create table"><Table2 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={insertImageSnippet} title="Insert image"><ImagePlus size={16} /></button>
              <button class="toolbar-icon-btn" on:click={insertLinkSnippet} title="Insert link"><Link2 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={formatUrlAction} title="Format URL"><ScanText size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>

            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={applyOrderedList} title="Ordered list"><ListOrdered size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => applyPrefixToSelectedLines('- ')} title="Unordered list"><List size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => applyPrefixToSelectedLines('- [ ] ')} title="Task list"><ListTodo size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>

            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={insertCodeBlock} title="Code block"><SquareCode size={16} /></button>
              <button class="toolbar-icon-btn" on:click={insertInlineCode} title="Inline code"><Code size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <div class="toolbar-group">
              <button class="toolbar-icon-btn" on:click={() => applyPrefixToSelectedLines('> ')} title="Quote"><Quote size={16} /></button>
              <button class="toolbar-icon-btn" on:click={insertHorizontalRule} title="Horizontal rule"><Minus size={16} /></button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>

            <div class="toolbar-group">
              <button class="toolbar-icon-btn" bind:this={emojiAnchorEl} class:active-toolbar={showEmojiMenu} on:click={openEmojiMenu} title="Insert emoji"><Smile size={16} /></button>
            </div>
          </div>

          <!-- Spacer -->
          <div class="toolbar-spacer"></div>

          <!-- Right side: View/Preview controls -->
          <div class="toolbar-right">
            <div class="toolbar-group">
              <button class="preview-icon-btn animate-fade-in" class:active-accent={$appStore.wordWrap} on:click={() => appStore.toggleWordWrap()} title="Toggle word wrap (Alt+Z)">
                <WrapText size={17} />
              </button>

            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <div class="toolbar-group">
              <button class="preview-icon-btn animate-fade-in" bind:this={importMenuAnchorEl} class:active-accent={showImportMenu} on:click={toggleImportMenu} title="Imports">
                <Upload size={17} />
              </button>
              <button class="preview-icon-btn animate-fade-in" bind:this={exportMenuAnchorEl} class:active-accent={showExportMenu} on:click={toggleExportMenu} title="Exports">
                <Download size={17} />
              </button>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <div class="toolbar-group">
              <button class="preview-icon-btn animate-fade-in" on:click={() => appStore.toggleTheme()} title="Toggle theme (Ctrl+Shift+L)">
                {#if $appStore.theme === 'dark'}
                  <Sun size={17} />
                {:else}
                  <Moon size={17} />
                {/if}
              </button>
              <button class="preview-icon-btn animate-fade-in" on:click={toggleFullscreen} title="Toggle fullscreen">
                {#if isFullscreen}
                  <Minimize size={17} />
                {:else}
                  <Maximize size={17} />
                {/if}
              </button>
            </div>
          </div>
        </div>

        <div class="toolbar-main mobile-toolbar">
          <button class="toolbar-icon-btn" on:click={() => wrapSelection('**')} title="Bold"><Bold size={16} /></button>
          <button class="toolbar-icon-btn" on:click={() => wrapSelection('*')} title="Italic"><Italic size={16} /></button>
          <button class="toolbar-icon-btn" on:click={insertLinkSnippet} title="Insert link"><Link2 size={16} /></button>
          <button class="toolbar-icon-btn" on:click={insertCodeBlock} title="Code block"><SquareCode size={16} /></button>
          <button class="toolbar-icon-btn" bind:this={overflowAnchorEl} class:active-toolbar={showToolbarOverflowMenu} on:click={toggleToolbarOverflow} title="More"><Ellipsis size={16} /></button>
        </div>

        {#if showToolbarOverflowMenu}
          <div class="toolbar-popover overflow-menu" style={overflowMenuStyle}>
            <div class="popover-grid">
              <button class="toolbar-icon-btn" on:click={() => { wrapSelection('~~', '~~', 'text'); showToolbarOverflowMenu = false; }} title="Strikethrough"><Strikethrough size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { wrapSelection('<u>', '</u>', 'text'); showToolbarOverflowMenu = false; }} title="Underline"><Underline size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertHeading(1); showToolbarOverflowMenu = false; }} title="Header 1"><Heading1 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertHeading(2); showToolbarOverflowMenu = false; }} title="Header 2"><Heading2 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertHeading(3); showToolbarOverflowMenu = false; }} title="Header 3"><Heading3 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { openTableMenu(); showToolbarOverflowMenu = false; }} title="Create table"><Table2 size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertImageSnippet(); showToolbarOverflowMenu = false; }} title="Insert image"><ImagePlus size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { formatUrlAction(); showToolbarOverflowMenu = false; }} title="Format URL"><ScanText size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { applyOrderedList(); showToolbarOverflowMenu = false; }} title="Ordered list"><ListOrdered size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { applyPrefixToSelectedLines('- '); showToolbarOverflowMenu = false; }} title="Unordered list"><List size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { applyPrefixToSelectedLines('- [ ] '); showToolbarOverflowMenu = false; }} title="Task list"><ListTodo size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertInlineCode(); showToolbarOverflowMenu = false; }} title="Inline code"><Code size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { applyPrefixToSelectedLines('> '); showToolbarOverflowMenu = false; }} title="Quote"><Quote size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { insertHorizontalRule(); showToolbarOverflowMenu = false; }} title="Horizontal rule"><Minus size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { openEmojiMenu(); showToolbarOverflowMenu = false; }} title="Insert emoji"><Smile size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { appStore.toggleWordWrap(); showToolbarOverflowMenu = false; }} title="Toggle word wrap"><WrapText size={16} /></button>

              <button class="toolbar-icon-btn" on:click={() => { toggleImportMenu(); showToolbarOverflowMenu = false; }} title="Imports"><Upload size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { toggleExportMenu(); showToolbarOverflowMenu = false; }} title="Exports"><Download size={16} /></button>
              <button class="toolbar-icon-btn" on:click={() => { appStore.toggleTheme(); showToolbarOverflowMenu = false; }} title="Theme">
                {#if $appStore.theme === 'dark'}
                  <Sun size={16} />
                {:else}
                  <Moon size={16} />
                {/if}
              </button>
              <button class="toolbar-icon-btn" on:click={() => { toggleFullscreen(); showToolbarOverflowMenu = false; }} title="Toggle fullscreen">
                {#if isFullscreen}
                  <Minimize size={16} />
                {:else}
                  <Maximize size={16} />
                {/if}
              </button>
            </div>
          </div>
        {/if}

        {#if showTableMenu}
          <div class="toolbar-popover table-menu" style={tableMenuStyle}>
            <div class="table-grid" role="grid">
              {#each Array(10) as _, row}
                <div class="table-grid-row">
                  {#each Array(10) as _, col}
                    <button
                      class="table-cell"
                      class:active-cell={row < tableHoverRows && col < tableHoverCols}
                      on:mouseenter={() => { tableHoverRows = row + 1; tableHoverCols = col + 1; }}
                      on:focus={() => { tableHoverRows = row + 1; tableHoverCols = col + 1; }}
                      on:click={() => insertTable(row + 1, col + 1)}
                      title={`${row + 1} x ${col + 1}`}
                    ></button>
                  {/each}
                </div>
              {/each}
            </div>
            <div class="table-grid-label">{tableHoverRows || 0} x {tableHoverCols || 0}</div>
          </div>
        {/if}

        {#if showEmojiMenu}
          <div class="toolbar-popover emoji-menu" style={emojiMenuStyle}>
            <!-- svelte-ignore a11y-missing-attribute -->
            <emoji-picker on:emoji-click={handleEmojiPicked}></emoji-picker>
          </div>
        {/if}


        <input bind:this={importInputEl} type="file" accept=".md,text/markdown" multiple hidden on:change={handleImportFiles} />
      </div>
    </div>
  {:else}
    <div class="toolbar-host empty-toolbars">
      <div class="empty-toolbar-state">
        <span>No document selected</span>
        <button class="btn btn-primary" on:click={handleNewDocument}>
          <Plus size={14} />
          Create document
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Workspace -->
  <div class="workspace">
    <!-- Editor Pane -->
    <section class="editor-pane" class:hidden-pane={viewMode === 'preview'} style="width: {viewMode === 'write' ? '100%' : `${sidebarWidth}%`}">
      <div class="editor-container">
        <!-- Line Numbers -->
        <div class="line-numbers" bind:this={lineNumbersEl} style="font-size: {Math.round((14 * uiZoom) / 100)}px">
          {#each Array(lineCount) as _, i}
            <div class="line-number">{i + 1}</div>
          {/each}
        </div>
        
        <!-- Editor -->
        <textarea
          bind:this={editorTextarea}
          class="editor-textarea"
          style="font-size: {Math.round((14 * uiZoom) / 100)}px"
          class:word-wrap-enabled={$appStore.wordWrap}
          aria-label="Markdown editor"
          value={currentDoc?.content || ''}
          on:input={handleContentChange}
          on:paste={handlePaste}
          on:scroll={handleEditorScroll}
          on:click={handleSelectionChange}
          on:keyup={handleSelectionChange}
          on:select={handleSelectionChange}
          on:keydown={handleEditorKeydown}
          on:dragover={(e) => {
            e.preventDefault();
            isEditorDragOver = true;
          }}
          on:dragleave={() => (isEditorDragOver = false)}
          on:drop={handleDropImport}
          class:drag-over={isEditorDragOver}
          placeholder="Start writing..."
          spellcheck="false"
        ></textarea>
      </div>
    </section>
    
    <!-- Resizer -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
      class="resizer"
      class:hidden-pane={viewMode !== 'split'}
      class:active={isResizing}
      on:mousedown={startResizing}
    ></div>
    
    <!-- Preview Pane -->
    <section class="preview-pane" class:hidden-pane={viewMode === 'write'}>
      <div class="preview-container" bind:this={previewContainer} class:word-wrap-enabled={$appStore.wordWrap} class:word-wrap-disabled={!$appStore.wordWrap}>
        {#if currentDoc}
          <article class="markdown-preview animate-fade-up" style="font-size: {uiZoom}%">
            {@html renderedMarkdown}
          </article>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">
              <FileText size={48} />
            </div>
            <p>No document selected</p>
            <button class="btn btn-primary" on:click={handleNewDocument}>
              <Plus size={16} />
              Create New Document
            </button>
          </div>
        {/if}
      </div>
    </section>

  </div>


  
  <!-- Status Bar -->
  <footer class="status-bar">
    <div class="status-left">
      <button class="status-icon-btn" on:click={() => (showSearchPanel = !showSearchPanel)} title="Global search">
        <Search size={14} />
      </button>
      <span class="status-pill subtle">
        {$appStore.documents.length} {$appStore.documents.length === 1 ? 'document' : 'documents'}
      </span>
      {#if currentDoc}
        <span class="status-pill">
          {wordCount.toLocaleString()} words
        </span>
        <span class="status-pill">
          {currentDoc.content.length.toLocaleString()} chars
        </span>
        <span class="status-pill">
          {lineCount.toLocaleString()} lines
        </span>
        <span class="status-pill">
          Line {caretLine}, Col {caretCol}
        </span>
        {#if selectionLength > 0}
          <span class="status-pill accent">{selectionLength} selected</span>
        {/if}
      {/if}
    </div>
    <div class="status-right">
      <div class="status-group">
        <button class="status-icon-btn" class:active-accent={viewMode === 'write'} on:click={() => viewMode = 'write'} title="Write Mode">
          <PenLine size={14} />
        </button>
        <button class="status-icon-btn" class:active-accent={viewMode === 'split'} on:click={() => viewMode = 'split'} title="Split Mode">
          <Columns size={14} />
        </button>
        <button class="status-icon-btn" class:active-accent={viewMode === 'preview'} on:click={() => viewMode = 'preview'} title="Preview Mode">
          <Eye size={14} />
        </button>
      </div>
      <span class="status-divider"></span>
      <button class="status-icon-btn" on:click={zoomOut} title="Zoom out (Ctrl+-)">-</button>
      <button class="status-icon-readout" on:click={resetZoom} title="Reset zoom (Ctrl+0)">{uiZoom}%</button>
      <button class="status-icon-btn" on:click={zoomIn} title="Zoom in (Ctrl/Cmd +)">+</button>
    </div>
  </footer>
</main>

{#if showPalette}
  <div class="palette-backdrop" role="presentation" on:click={closePalette}></div>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="palette-input-wrap">
      <input
        bind:this={paletteInputEl}
        class="palette-input"
        type="text"
        placeholder="Type a command..."
        value={paletteFilter}
        on:input={handlePaletteInput}
        on:keydown={handlePaletteKeydown}
      />
    </div>
    <div class="palette-list">
      {#if filteredCommands.length === 0}
        <div class="palette-empty">No matches</div>
      {:else}
        {#each filteredCommands as cmd}
          <button class="palette-item" on:click={() => runPaletteCommand(cmd)}>
            <div class="palette-title">{cmd.label}</div>
            <div class="palette-desc">{cmd.desc}</div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

{#if showSearchPanel}
  <div class="palette-backdrop" role="presentation" on:click={() => (showSearchPanel = false)}></div>
  <div class="floating-panel">
    <div class="search-panel-header">
      <h3>Global search</h3>
      <button class="status-icon-btn" on:click={() => (showSearchPanel = false)} title="Close">×</button>
    </div>
    <input class="panel-input" bind:value={searchQuery} placeholder="Search in all documents" on:keydown={handleSearchKeydown} />
    <input class="panel-input" bind:value={replaceQuery} placeholder="Replace with" on:keydown={handleSearchKeydown} />
    <div class="search-panel-actions">
      <button class="btn" on:click={handleReplaceAll}>Replace all</button>
      <span class="palette-desc">{searchResults.length} result(s)</span>
    </div>
    <div class="search-list">
      {#each searchResults as result}
        <button class="palette-item" on:click={() => jumpToSearchResult(result.id)}>
          <div class="palette-title">{result.name}</div>
          <div class="palette-desc">{result.matches} matches</div>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if showImportMenu}
  <div class="palette-backdrop" role="presentation" on:click={() => (showImportMenu = false)}></div>
  <div class="floating-panel">
    <div class="search-panel-header">
      <h3>Import</h3>
      <button class="status-icon-btn" on:click={() => (showImportMenu = false)} title="Close">×</button>
    </div>
    <div class="search-list" style="margin-top: 8px;">
      <button class="palette-item" style="text-align: left;" on:click={() => { importInputEl?.click(); showImportMenu = false; }}>
        <div class="palette-title" style="display: flex; align-items: center; gap: 8px;">
          <Upload size={14} /> Import Markdown
        </div>
        <div class="palette-desc">Load .md files from your computer</div>
      </button>
    </div>
  </div>
{/if}

{#if showExportMenu}
  <div class="palette-backdrop" role="presentation" on:click={() => (showExportMenu = false)}></div>
  <div class="floating-panel">
    <div class="search-panel-header">
      <h3>Export</h3>
      <button class="status-icon-btn" on:click={() => (showExportMenu = false)} title="Close">×</button>
    </div>
    <div class="search-list" style="margin-top: 8px;">
      <button class="palette-item" style="text-align: left;" on:click={() => { handleDownload(); showExportMenu = false; }}>
        <div class="palette-title" style="display: flex; align-items: center; gap: 8px;">
          <Download size={14} /> Download .md
        </div>
        <div class="palette-desc">Save the raw markdown file</div>
      </button>
      <button class="palette-item" style="text-align: left;" on:click={() => { handleExportHtml(); showExportMenu = false; }}>
        <div class="palette-title" style="display: flex; align-items: center; gap: 8px;">
          <FileDown size={14} /> Export HTML
        </div>
        <div class="palette-desc">Save rendered document as standalone HTML</div>
      </button>
      <button class="palette-item" style="text-align: left;" on:click={() => { handleExportPdf(); showExportMenu = false; }}>
        <div class="palette-title" style="display: flex; align-items: center; gap: 8px;">
          <FileUp size={14} /> Export PDF
        </div>
        <div class="palette-desc">Print rendered document to PDF</div>
      </button>
    </div>
  </div>
{/if}

<style>
  @import url('https://fonts.googleapis.com/css2?family=Questrial&display=swap');

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: transparent;
    padding: 10px;
    gap: 10px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 4px 6px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(8px);
  }

  .app-brand {
    flex-shrink: 0;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-primary);
    padding: 0 4px;
    font-family: 'Questrial', sans-serif;
  }

  .tabs-container {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .tabs-scroll {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    max-width: 100%;
    padding: 2px 2px 6px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--text-secondary) 55%, transparent) transparent;
  }

  .tabs-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .tabs-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .tabs-scroll::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--text-secondary) 48%, transparent);
  }

  .tabs-scroll::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--text-primary) 62%, transparent);
  }

  .tab-wrapper {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tab-wrapper.active {
    z-index: 2;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 220px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    padding: 6px 8px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--bg-surface);
    border-color: var(--border-subtle);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 124px;
  }

  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: 2px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    opacity: 0;
    transform: scale(0.88);
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 1;
    transform: scale(1);
  }

  .tab-close:hover {
    background: var(--bg-hover);
    color: var(--accent-primary);
  }

  .rename-input {
    font-family: inherit;
    width: 160px;
    border: 1px solid var(--accent-primary);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    padding: 6px 8px;
    font-size: 0.8rem;
    font-weight: 600;
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }

  .add-tab-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .add-tab-btn:hover {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    color: var(--accent-primary);
  }

  .add-tab-btn:disabled,
  .add-tab-btn.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-tab-btn:disabled:hover,
  .add-tab-btn.is-disabled:hover {
    background: transparent;
    color: var(--text-secondary);
  }

  .panel-input {
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-primary);
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    font-size: 0.78rem;
    min-height: 34px;
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .panel-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
  }

  .workspace {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-surface) 86%, transparent);
    box-shadow: var(--shadow-md);
  }

  .toolbar-host {
    border: 1px solid var(--border-subtle);
    border-top: none;
    background: color-mix(in srgb, var(--bg-surface) 90%, transparent);
  }

  .empty-toolbars {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-toolbar-state {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .editor-pane,
  .preview-pane {
    display: flex;
    flex-direction: column;
    min-width: 220px;
    min-height: 0;
    background: var(--bg-surface);
  }

  .editor-pane {
    border-right: 1px solid var(--border-subtle);
    overflow: hidden;
    min-height: 0;
  }

  .preview-pane {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .format-toolbar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    border-bottom: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-sidebar) 70%, var(--bg-surface));
    overflow-x: auto;
    overflow-y: visible;
    width: 100%;
  }

  .unified-toolbar {
    justify-content: flex-start;
    width: 100%;
  }

  .toolbar-main {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    flex-wrap: nowrap;
  }

  .toolbar-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
  }

  .toolbar-divider {
    width: 1px;
    height: 16px;
    margin: 0 8px;
    background: color-mix(in srgb, var(--text-secondary) 42%, transparent);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0;
    flex-wrap: nowrap;
  }

  .toolbar-spacer {
    flex: 1 1 auto;
    min-width: 40px;
  }

  .toolbar-icon-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toolbar-icon-btn:hover,
  .toolbar-icon-btn.active-toolbar {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }

  .preview-icon-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .preview-icon-btn:hover,
  .preview-icon-btn.active-accent {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }

  .mobile-toolbar {
    display: none;
  }

  .toolbar-popover {
    position: absolute;
    z-index: 25;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    box-shadow: var(--shadow-md);
    padding: 6px;
  }

  .overflow-menu {
    width: 310px;
  }

  .popover-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .table-menu {
    width: 236px;
  }

  .table-grid {
    display: grid;
    gap: 2px;
  }

  .table-grid-row {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 2px;
  }

  .table-cell {
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-subtle);
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .table-cell:hover,
  .table-cell.active-cell {
    background: color-mix(in srgb, var(--accent-primary) 25%, transparent);
    border-color: var(--accent-primary);
  }

  .table-grid-label {
    margin-top: 6px;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  .emoji-menu {
    width: 336px;
    padding: 0;
  }

  :global(.emoji-menu emoji-picker) {
    --border-size: 0;
    --background: var(--bg-surface);
    --input-background-color: var(--bg-hover);
    --input-border-color: var(--border-subtle);
    --input-font-color: var(--text-primary);
    --category-font-color: var(--text-secondary);
    --category-font-color-hover: var(--text-primary);
    --indicator-color: var(--accent-primary);
    --button-hover-background: color-mix(in srgb, var(--accent-primary) 14%, transparent);
    --outline-color: var(--accent-primary);
    --emoji-size: 1.25rem;
    width: 100%;
    min-height: 360px;
  }

  .editor-container {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .line-numbers {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    user-select: none;
    border-right: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-sidebar) 55%, transparent);
    pointer-events: none;
  }

  .line-number {
    height: 1.7em;
    line-height: 1.7;
  }

  .line-numbers::-webkit-scrollbar {
    width: 6px;
  }

  .line-numbers::-webkit-scrollbar-track {
    background: transparent;
  }

  .line-numbers::-webkit-scrollbar-thumb {
    background-color: color-mix(in srgb, var(--text-secondary) 30%, transparent);
    border-radius: 3px;
  }

  .line-numbers::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, var(--text-secondary) 50%, transparent);
  }

  .editor-textarea {
    flex: 1;
    border: none;
    outline: none;
    resize: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 14px;
    line-height: 1.7;
    background: var(--bg-surface);
    color: var(--text-primary);
    padding: 1.4em;
    tab-size: 2;
    -moz-tab-size: 2;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
    overflow-y: auto;
  }

  .editor-textarea::placeholder {
    color: var(--text-tertiary);
  }

  .editor-textarea.drag-over {
    box-shadow: inset 0 0 0 2px var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface));
  }

  .editor-textarea.word-wrap-enabled {
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  .preview-container {
    flex: 1;
    overflow: auto;
    padding: 2.1rem 2.3rem;
    min-height: 0;
    height: 100%;
    background: var(--bg-surface);
  }

  .preview-container.word-wrap-enabled .markdown-preview {
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .preview-container.word-wrap-disabled .markdown-preview {
    white-space: pre;
    overflow-x: auto;
  }

  .markdown-preview {
    max-width: 820px;
    margin: 0 auto;
  }

  .resizer {
    width: 8px;
    background: transparent;
    cursor: col-resize;
    position: relative;
    flex-shrink: 0;
  }

  .resizer::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 50px;
    border-radius: 999px;
    background: var(--border-subtle);
    transform: translate(-50%, -50%);
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
  }

  .resizer:hover::after,
  .resizer.active::after {
    background: var(--accent-primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(4px);
    z-index: 50;
  }

  .palette {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    width: min(700px, 94vw);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-surface);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    z-index: 51;
  }

  .palette-input-wrap {
    padding: 14px;
    border-bottom: 1px solid var(--border-subtle);
    background: color-mix(in srgb, var(--bg-sidebar) 65%, var(--bg-surface));
  }

  .palette-input {
    width: 100%;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-primary);
    padding: 0.75rem 0.85rem;
    font-size: 0.92rem;
    outline: none;
  }

  .palette-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 14%, transparent);
  }

  .palette-list {
    max-height: 380px;
    overflow: auto;
    padding: 6px;
  }

  .palette-item {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: all var(--transition-fast);
  }

  .palette-item:hover {
    border-color: var(--border-subtle);
    background: var(--bg-hover);
  }

  .palette-title {
    font-size: 0.88rem;
    font-weight: 700;
  }

  .palette-desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .palette-empty {
    padding: 14px;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .floating-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 28px));
    max-height: calc(100vh - 160px);
    overflow: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
    box-shadow: var(--shadow-lg);
    z-index: 55;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    backdrop-filter: blur(8px);
    animation: searchPanelIn 180ms ease-out;
  }

  .floating-panel h3 {
    font-size: 0.93rem;
    font-weight: 700;
  }

  .search-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 6px;
  }

  .search-panel-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .search-list {
    max-height: 320px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .status-bar {
    min-height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    box-shadow: var(--shadow-sm);
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 0.75rem;
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0.2rem 0.35rem;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    line-height: 1.2;
    font-weight: 600;
  }

  .status-pill.subtle {
    background: transparent;
  }

  .status-pill.accent {
    background: color-mix(in srgb, var(--accent-primary) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent-primary) 34%, transparent);
    color: var(--accent-primary);
  }

  .status-icon-btn,
  .status-icon-readout {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    min-height: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0 4px;
  }

  .status-icon-btn:hover,
  .status-icon-readout:hover {
    color: var(--text-primary);
    background: transparent;
  }

  .status-icon-btn.active-accent {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    border-radius: 4px;
  }

  .status-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: color-mix(in srgb, var(--bg-hover) 30%, transparent);
    padding: 2px;
    border-radius: 6px;
  }

  .status-group .status-icon-btn {
    border-radius: 4px;
  }

  .status-divider {
    width: 1px;
    height: 14px;
    background: var(--border-subtle);
    margin: 0 4px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    padding: 0.5rem 0.8rem;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn:hover {
    border-color: var(--border-subtle);
    background: var(--bg-hover);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
    color: #fff;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    gap: 10px;
    color: var(--text-secondary);
  }

  .empty-icon {
    color: var(--text-tertiary);
  }

  :global(.markdown-preview pre.code-block) {
    position: relative;
    padding-top: 2.7rem;
    border: 1px solid var(--border-subtle);
  }

  :global(.markdown-preview .code-toolbar) {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity var(--transition-fast), transform var(--transition-fast);
  }

  :global(.markdown-preview pre.code-block:hover .code-toolbar) {
    opacity: 1;
    transform: translateY(0);
  }

  :global(.markdown-preview .code-action) {
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 0.74rem;
    padding: 0.22rem 0.52rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  :global(.markdown-preview .code-action:hover) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }



  :global(.markdown-preview .callout) {
    border: 1px solid var(--border-subtle);
    border-left-width: 4px;
    border-radius: 6px;
    padding: 0.75rem 0.9rem;
    margin: 1rem 0;
    background: color-mix(in srgb, var(--bg-hover) 68%, var(--bg-surface));
  }

  :global(.markdown-preview .callout-title) {
    font-weight: 700;
    margin-bottom: 0.3rem;
    text-transform: uppercase;
    font-size: 0.78rem;
    letter-spacing: 0.02em;
  }

  :global(.markdown-preview .callout.info) { border-left-color: #3b82f6; }
  :global(.markdown-preview .callout.warn),
  :global(.markdown-preview .callout.warning) { border-left-color: #f59e0b; }
  :global(.markdown-preview .callout.error) { border-left-color: #ef4444; }
  :global(.markdown-preview .callout.success) { border-left-color: #22c55e; }
  :global(.markdown-preview .callout.tip) { border-left-color: #a855f7; }

  @keyframes searchPanelIn {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  @media (max-width: 900px) {
    .app-container {
      padding: 8px;
      gap: 8px;
    }

    .header {
      min-height: auto;
      padding: 8px;
    }

    .workspace {
      flex-direction: column;
    }

    .editor-pane,
    .preview-pane {
      width: 100% !important;
      height: 45%;
      min-width: 0;
    }

    .editor-pane {
      border-right: none;
      border-bottom: 1px solid var(--border-subtle);
    }

    .resizer {
      width: 100%;
      height: 8px;
      cursor: row-resize;
    }

    .resizer::after {
      width: 56px;
      height: 2px;
    }

    .preview-container {
      padding: 1.2rem;
    }

    .desktop-toolbar {
      display: none;
    }

    .mobile-toolbar {
      display: inline-flex;
    }

    .floating-panel {
      top: auto;
      bottom: 54px;
      left: 8px;
      right: 8px;
      transform: none;
      width: auto;
      max-height: 52vh;
    }

    .status-bar {
      padding: 6px 8px;
      gap: 6px;
    }
  }

  @media (max-width: 640px) {
    .app-container {
      padding: 6px;
      gap: 6px;
    }

    .tabs-scroll {
      gap: 4px;
    }

    .tab {
      max-width: 160px;
      padding: 5px 7px;
    }

    .tab-name {
      max-width: 88px;
    }

    .status-left .status-pill:nth-child(n + 3) {
      display: none;
    }
  }

  /* Flat + compact mode requested */
  .app-container {
    padding: 0 !important;
    gap: 0 !important;
  }

  .header,
  .workspace,
  .status-bar,
  .tab,
  .tab-close,
  .add-tab-btn,
  .rename-input,
  .panel-input,
  .toolbar-icon-btn,
  .preview-icon-btn,
  .btn,
  .palette,
  .palette-input,
  .palette-item,
  .floating-panel,
  .status-pill,
  .toolbar-host,
  :global(.markdown-preview pre),
  :global(.markdown-preview code),
  :global(.markdown-preview img),
  :global(.markdown-preview .code-action),
  :global(.markdown-preview .callout) {
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .header {
    padding: 2px 4px !important;
    gap: 4px !important;
    backdrop-filter: none !important;
  }

  .tabs-scroll,
  .format-toolbar {
    gap: 2px !important;
    padding: 2px !important;
  }

  .tab {
    padding: 3px 6px !important;
  }

  .panel-input,
  .btn,
  .status-icon-btn,
  .status-icon-readout {
    min-height: 24px !important;
    height: 24px !important;
    padding: 0 6px !important;
  }

  .editor-textarea {
    padding: 0.6em !important;
  }

  .preview-container {
    padding: 0.7rem !important;
  }

  .status-bar {
    padding: 2px 6px !important;
    min-height: 26px !important;
  }

  .mobile-dev-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .mobile-dev-modal {
    width: min(420px, 100%);
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mobile-dev-modal h3 {
    font-size: 0.95rem;
  }

  .mobile-dev-modal p {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
</style>
