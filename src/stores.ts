import { writable, derived } from 'svelte/store';
import type { Readable } from 'svelte/store';

// ============================================
// TYPES
// ============================================

export interface Document {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistorySnapshot {
  content: string;
  timestamp: number;
}

export interface AppState {
  documents: Document[];
  activeDocumentId: string | null;
  theme: 'light' | 'dark';
  sidebarWidth: number;
  wordWrap: boolean;
  historyByDoc: Record<string, HistorySnapshot[]>;
}

// ============================================
// STORAGE UTILS
// ============================================

const STORAGE_KEY = 'aire-v2';
const LEGACY_STORAGE_KEY = 'aire-v1';
const MAX_HISTORY_ENTRIES = 20;
const MAX_TABS = 32;
const HISTORY_DEBOUNCE_MS = 2000;

type LegacyDocument = Partial<Document> & { workspaceId?: string };
type StoredStateLike = Partial<AppState> & {
  documents?: LegacyDocument[];
  activeWorkspaceId?: string;
  workspaces?: unknown[];
};

const now = () => Date.now();

const createDefaultDocument = (): Document => ({
  id: crypto.randomUUID(),
  name: 'Untitled',
  content: `# Welcome to Aire

This is a **modern**, _fluid_ markdown editor with full GitHub Flavored Markdown support.

## Features

- ✅ Full GFM support (tables, task lists, strikethrough)
- ✅ Syntax highlighting for code blocks
- ✅ Multiple tabs
- ✅ Light & Dark themes
- ✅ Everything auto-saved to localStorage

## Try It Out

### Code Block

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

### Table

| Feature | Status | Notes |
|---------|--------|-------|
| GFM Support | ✅ | Complete |
| Syntax Highlight | ✅ | 100+ languages |
| Themes | ✅ | Light & Dark |

### Task List

- [x] Create awesome editor
- [x] Add smooth animations
- [ ] Write documentation
- [ ] Share with friends

> "Simplicity is the ultimate sophistication." - Leonardo da Vinci

Enjoy writing! 🚀
`,
  createdAt: now(),
  updatedAt: now(),
});

function safeParse(raw: string | null): StoredStateLike | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredStateLike;
  } catch (e) {
    console.error('Failed to parse localStorage state:', e);
    return null;
  }
}

function normalizeDocuments(input: LegacyDocument[] | undefined): Document[] {
  if (!Array.isArray(input) || input.length === 0) return [createDefaultDocument()];
  const ts = now();
  const docs = input.map((doc, index) => ({
    id: typeof doc.id === 'string' && doc.id.trim() ? doc.id : crypto.randomUUID(),
    name: typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : index === 0 ? 'Untitled' : `Untitled ${index + 1}`,
    content: typeof doc.content === 'string' ? doc.content : '',
    createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : ts,
    updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : ts,
  }));
  return docs.slice(0, MAX_TABS);
}

function normalizeHistory(historyByDoc: unknown): Record<string, HistorySnapshot[]> {
  if (!historyByDoc || typeof historyByDoc !== 'object') return {};
  const entries = Object.entries(historyByDoc as Record<string, unknown>).map(([docId, snapshots]) => {
    if (!Array.isArray(snapshots)) return [docId, [] as HistorySnapshot[]] as const;
    const normalized = snapshots
      .filter((entry): entry is { content: unknown; timestamp: unknown } => !!entry && typeof entry === 'object')
      .map((entry) => ({
        content: typeof entry.content === 'string' ? entry.content : '',
        timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : now(),
      }))
      .slice(-MAX_HISTORY_ENTRIES);
    return [docId, normalized] as const;
  });
  return Object.fromEntries(entries);
}

function loadFromStorage(): AppState {
  const rawV2 = safeParse(localStorage.getItem(STORAGE_KEY));
  const rawV1 = rawV2 ? null : safeParse(localStorage.getItem(LEGACY_STORAGE_KEY));
  const stored = rawV2 || rawV1;

  const documents = normalizeDocuments(stored?.documents);
  const activeDocumentId =
    typeof stored?.activeDocumentId === 'string' && documents.some((d) => d.id === stored.activeDocumentId)
      ? stored.activeDocumentId
      : documents[0]?.id || null;

  return {
    documents,
    activeDocumentId,
    theme: stored?.theme === 'light' ? 'light' : 'dark',
    sidebarWidth: typeof stored?.sidebarWidth === 'number' ? stored.sidebarWidth : 50,
    wordWrap: stored?.wordWrap ?? true,
    historyByDoc: normalizeHistory(stored?.historyByDoc),
  };
}

function saveToStorage(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

// ============================================
// STORES
// ============================================

function createDocumentStore() {
  const initialState: AppState = loadFromStorage();
  const { subscribe, set, update } = writable<AppState>(initialState);

  subscribe((state) => {
    saveToStorage(state);
  });

  return {
    subscribe,

    createDocument: (name?: string, content?: string) => {
      const newDoc: Document = {
        id: crypto.randomUUID(),
        name: name || 'Untitled',
        content: content || '',
        createdAt: now(),
        updatedAt: now(),
      };
      let createdId: string | null = null;

      update((state) => {
        if (state.documents.length >= MAX_TABS) return state;
        createdId = newDoc.id;
        return {
          ...state,
          documents: [...state.documents, newDoc],
          activeDocumentId: newDoc.id,
        };
      });

      return createdId;
    },

    updateDocument: (id: string, updates: Partial<Document>) => {
      update((state) => ({
        ...state,
        documents: state.documents.map((doc) =>
          doc.id === id
            ? { ...doc, ...updates, updatedAt: now() }
            : doc
        ),
      }));
    },

    updateDocumentContent: (id: string, content: string) => {
      update((state) => {
        const timestamp = now();
        const previousDoc = state.documents.find((doc) => doc.id === id);
        const documents = state.documents.map((doc) =>
          doc.id === id
            ? { ...doc, content, updatedAt: timestamp }
            : doc
        );
        const previousHistory = state.historyByDoc[id] || [];
        const lastSnapshot = previousHistory[previousHistory.length - 1];
        const timeSinceLast = lastSnapshot ? timestamp - lastSnapshot.timestamp : Infinity;
        const shouldAppend = previousDoc && previousDoc.content !== content && timeSinceLast >= HISTORY_DEBOUNCE_MS;
        const historyByDoc = shouldAppend
          ? {
              ...state.historyByDoc,
              [id]: [
                ...previousHistory,
                { content: previousDoc.content, timestamp },
              ].slice(-MAX_HISTORY_ENTRIES),
            }
          : state.historyByDoc;

        return {
          ...state,
          documents,
          historyByDoc,
        };
      });
    },

    restoreDocumentVersion: (id: string, historyIndex: number) => {
      update((state) => {
        const snapshots = state.historyByDoc[id] || [];
        const snapshot = snapshots[historyIndex];
        if (!snapshot) return state;
        return {
          ...state,
          documents: state.documents.map((doc) =>
            doc.id === id
              ? { ...doc, content: snapshot.content, updatedAt: now() }
              : doc
          ),
        };
      });
    },

    renameDocument: (id: string, name: string) => {
      update((state) => ({
        ...state,
        documents: state.documents.map((doc) =>
          doc.id === id
            ? { ...doc, name, updatedAt: now() }
            : doc
        ),
      }));
    },

    deleteDocument: (id: string) => {
      update((state) => {
        const documents = state.documents.filter((doc) => doc.id !== id);
        if (documents.length === 0) {
          const fallback = createDefaultDocument();
          const { [id]: _removed, ...remainingHistory } = state.historyByDoc;
          return {
            ...state,
            documents: [fallback],
            activeDocumentId: fallback.id,
            historyByDoc: remainingHistory,
          };
        }

        const activeDocumentId = state.activeDocumentId === id ? documents[0].id : state.activeDocumentId;
        return {
          ...state,
          documents,
          activeDocumentId,
          historyByDoc: Object.fromEntries(Object.entries(state.historyByDoc).filter(([docId]) => docId !== id)),
        };
      });
    },

    setActiveDocument: (id: string) => {
      update((state) => ({
        ...state,
        activeDocumentId: id,
      }));
    },

    reorderDocuments: (newOrder: Document[]) => {
      update((state) => ({
        ...state,
        documents: newOrder,
      }));
    },

    toggleTheme: () => {
      update((state) => ({
        ...state,
        theme: state.theme === 'light' ? 'dark' : 'light',
      }));
    },

    setTheme: (theme: 'light' | 'dark') => {
      update((state) => ({
        ...state,
        theme,
      }));
    },

    setSidebarWidth: (width: number) => {
      update((state) => ({
        ...state,
        sidebarWidth: Math.max(20, Math.min(80, width)),
      }));
    },

    toggleWordWrap: () => {
      update((state) => ({
        ...state,
        wordWrap: !state.wordWrap,
      }));
    },

    setWordWrap: (enabled: boolean) => {
      update((state) => ({
        ...state,
        wordWrap: enabled,
      }));
    },

    reset: () => {
      const doc = createDefaultDocument();
      set({
        documents: [doc],
        activeDocumentId: doc.id,
        theme: 'dark',
        sidebarWidth: 50,
        wordWrap: true,
        historyByDoc: {},
      });
    },
  };
}

export const appStore = createDocumentStore();

export const activeDocument: Readable<Document | null> = derived(
  appStore,
  ($appStore) =>
    $appStore.documents.find((doc) => doc.id === $appStore.activeDocumentId) || null
);

export const documentCount: Readable<number> = derived(
  appStore,
  ($appStore) => $appStore.documents.length
);

export const hasUnsavedChanges: Readable<boolean> = derived(
  appStore,
  () => false
);
