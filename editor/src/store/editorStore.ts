import { create } from 'zustand';
import type {
  ConsoleEntry,
  DomTreeNode,
  EditorMode,
  HistoryEntry,
  NetworkEntry,
  SelectedNode,
  SemanticChange,
  SourceLocation,
  StyleSnapshot,
  ThemeMode,
} from '@ve/core';
import { createChange } from '@ve/core';
import type { FileHunk } from '@ve/code-engine';
import {
  buildImportPageDiffs,
  buildSideBySideFromUnified,
  generateHunks,
} from '@ve/code-engine';
import config from '../../../.visualeditorrc.json';
import { highlightNode } from '../bridge/iframeBridge';
import { appUrl } from '../utils/appBase';
import { resolveImportPageSrc } from '../utils/previewUrl';
import { applyEditorTheme, readStoredTheme } from '../utils/theme';

export type ImportSource = 'file' | 'paste';
export type DebugTab = 'console' | 'network';

const MAX_NETWORK_ENTRIES = 500;

interface EditorState {
  connected: boolean;
  pageLabel: string;
  iframeSrc: string;
  importSource: ImportSource;
  importId: string | null;
  projectName: string;
  tree: DomTreeNode[];
  selected: SelectedNode | null;
  selectedIds: string[];
  editorMode: EditorMode;
  theme: ThemeMode;
  consoleEntries: ConsoleEntry[];
  networkEntries: NetworkEntry[];
  debugTab: DebugTab;
  consoleOpen: boolean;
  applyNote: string;
  pendingChanges: SemanticChange[];
  history: HistoryEntry[];
  historyIndex: number;
  diffOpen: boolean;
  diffLoading: boolean;
  hunks: FileHunk[];
  connectImport: (importId: string, label: string, source: ImportSource) => void;
  disconnect: () => void;
  setTree: (tree: DomTreeNode[]) => void;
  selectNode: (node: SelectedNode | null, multi?: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setTheme: (theme: ThemeMode) => void;
  addConsoleEntry: (entry: ConsoleEntry) => void;
  addNetworkEntry: (entry: NetworkEntry) => void;
  addNetworkBatch: (entries: NetworkEntry[]) => void;
  setDebugTab: (tab: DebugTab) => void;
  toggleConsole: () => void;
  setApplyNote: (note: string) => void;
  pushStyleChange: (
    nodeId: string,
    cssProperty: string,
    value: string,
    meta: Partial<SelectedNode>
  ) => void;
  pushPropChange: (nodeId: string, prop: string, value: unknown) => void;
  pushReorderChange: (parentId: string, childIds: string[], meta?: Partial<SelectedNode>) => void;
  pushTextChange: (nodeId: string, text: string, previousText: string, meta: Partial<SelectedNode>) => void;
  pushMediaChange: (
    nodeId: string,
    attr: string,
    value: string,
    previousValue: string,
    meta: Partial<SelectedNode>
  ) => void;
  updateSelectedText: (text: string) => void;
  updateSelectedMediaField: (attr: string, value: string) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => StyleSnapshot[] | null;
  redo: () => StyleSnapshot[] | null;
  openDiff: () => void;
  closeDiff: () => void;
  toggleHunk: (id: string) => void;
  clearPending: () => void;
}

function syncSelectedAfterRestore(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  snapshots: StyleSnapshot[]
) {
  const sel = get().selected;
  if (!sel) return;
  const snap = snapshots.find((s) => s.nodeId === sel.id);
  if (!snap) return;
  const mediaFields =
    snap.mediaAttrs && sel.mediaFields
      ? sel.mediaFields.map((f) =>
          snap.mediaAttrs![f.name] !== undefined ? { ...f, value: snap.mediaAttrs![f.name] } : f
        )
      : sel.mediaFields;

  set({
    selected: {
      ...sel,
      styles: { ...snap.styles },
      ...(snap.textContent !== undefined ? { textContent: snap.textContent } : {}),
      ...(mediaFields ? { mediaFields } : {}),
    },
  });
}

function ensureSnapshot(
  map: Map<string, StyleSnapshot>,
  nodeId: string
): StyleSnapshot {
  let snap = map.get(nodeId);
  if (!snap) {
    snap = { nodeId, styles: {} };
    map.set(nodeId, snap);
  }
  return snap;
}

function withNodeText(
  snapshots: StyleSnapshot[],
  nodeId: string,
  text: string
): StyleSnapshot[] {
  const map = new Map(snapshots.map((s) => [s.nodeId, { ...s, styles: { ...s.styles } }]));
  const snap = ensureSnapshot(map, nodeId);
  snap.textContent = text;
  return Array.from(map.values());
}

function withNodeMedia(
  snapshots: StyleSnapshot[],
  nodeId: string,
  attrs: Record<string, string>
): StyleSnapshot[] {
  const map = new Map(
    snapshots.map((s) => [
      s.nodeId,
      { ...s, styles: { ...s.styles }, mediaAttrs: s.mediaAttrs ? { ...s.mediaAttrs } : undefined },
    ])
  );
  const snap = ensureSnapshot(map, nodeId);
  snap.mediaAttrs = { ...(snap.mediaAttrs ?? {}), ...attrs };
  return Array.from(map.values());
}

function buildSnapshots(changes: SemanticChange[]): StyleSnapshot[] {
  const map = new Map<string, StyleSnapshot>();
  changes.forEach((ch) => {
    const id = ch.target.nodeId;
    if (ch.kind === 'style' || ch.kind === 'layout') {
      const prop = String(ch.payload.cssProperty ?? '');
      const val = String(ch.payload.value ?? '');
      if (!prop) return;
      ensureSnapshot(map, id).styles[prop] = val;
    }
    if (ch.kind === 'text') {
      ensureSnapshot(map, id).textContent = String(ch.payload.text ?? '');
    }
    if (ch.kind === 'media') {
      const attr = String(ch.payload.attr ?? '');
      const val = String(ch.payload.value ?? '');
      if (attr) {
        const snap = ensureSnapshot(map, id);
        snap.mediaAttrs = { ...(snap.mediaAttrs ?? {}), [attr]: val };
      }
    }
  });
  return Array.from(map.values());
}

function resolveChangeSource(
  importId: string | null,
  meta?: Partial<SelectedNode>
): SourceLocation | undefined {
  if (meta?.source) return meta.source;
  if (importId) return { file: `imports/${importId}.html`, line: 0, column: 0 };
  return undefined;
}

function hunksWithSideBySide(hunks: FileHunk[]): FileHunk[] {
  return hunks.map((h) => {
    if (h.sideBySideRows?.length || h.diffLines?.length) return h;
    const diffLines: {
      type: 'del' | 'add';
      content: string;
      oldLine?: number;
      newLine?: number;
    }[] = [];
    h.oldLines.forEach((c, i) => diffLines.push({ type: 'del', content: c, oldLine: i + 1 }));
    h.newLines.forEach((c, i) => diffLines.push({ type: 'add', content: c, newLine: i + 1 }));
    return { ...h, sideBySideRows: buildSideBySideFromUnified(diffLines), diffLines };
  });
}

function pushHistoryEntry(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  entry: HistoryEntry,
  nodeId: string,
  patchSelected?: Partial<SelectedNode>
) {
  const history = get().history.slice(0, get().historyIndex + 1);
  history.push(entry);
  const selected = get().selected;
  const nextSelected =
    selected?.id === nodeId && patchSelected
      ? { ...selected, ...patchSelected }
      : selected;
  set({
    pendingChanges: [...get().pendingChanges, ...entry.changes],
    history,
    historyIndex: history.length - 1,
    selected: nextSelected,
  });
}

export const useEditorStore = create<EditorState>((set, get) => ({
  connected: false,
  pageLabel: '',
  iframeSrc: '',
  importSource: 'file',
  importId: null,
  projectName: '',
  tree: [],
  selected: null,
  selectedIds: [],
  editorMode: 'inspect',
  theme: readStoredTheme(),
  consoleEntries: [],
  networkEntries: [],
  debugTab: 'console',
  consoleOpen: false,
  applyNote: '',
  pendingChanges: [],
  history: [],
  historyIndex: -1,
  diffOpen: false,
  diffLoading: false,
  hunks: [],

  connectImport: (importId, label, source) => {
    set({
      connected: true,
      pageLabel: label,
      iframeSrc: resolveImportPageSrc(importId),
      importSource: source,
      importId,
      projectName: label,
      consoleEntries: [],
      networkEntries: [],
      debugTab: 'console',
      tree: [],
    });
  },

  disconnect: () =>
    set({
      connected: false,
      selected: null,
      selectedIds: [],
      tree: [],
      pendingChanges: [],
      diffOpen: false,
      consoleEntries: [],
      networkEntries: [],
      importId: null,
    }),

  setTree: (tree) => set({ tree }),

  selectNode: (node, multi = false) => {
    if (!node) {
      highlightNode(null);
      set({ selected: null, selectedIds: [] });
      return;
    }
    if (multi) {
      const ids = get().selectedIds.includes(node.id)
        ? get().selectedIds.filter((i) => i !== node.id)
        : [...get().selectedIds, node.id];
      set({
        selected: node,
        selectedIds: ids.length ? ids : [node.id],
      });
    } else {
      set({ selected: node, selectedIds: [node.id] });
    }
  },

  setEditorMode: (mode) => set({ editorMode: mode }),

  setTheme: (theme) => {
    applyEditorTheme(theme);
    set({ theme });
  },

  addConsoleEntry: (entry) =>
    set((s) => ({
      consoleEntries: [...s.consoleEntries.slice(-199), entry],
    })),

  addNetworkEntry: (entry) =>
    set((s) => ({
      networkEntries: [...s.networkEntries.slice(-(MAX_NETWORK_ENTRIES - 1)), entry],
    })),

  addNetworkBatch: (entries) =>
    set((s) => ({
      networkEntries: [...s.networkEntries, ...entries].slice(-MAX_NETWORK_ENTRIES),
    })),

  setDebugTab: (tab) => set({ debugTab: tab }),

  toggleConsole: () => set((s) => ({ consoleOpen: !s.consoleOpen })),

  setApplyNote: (note) => set({ applyNote: note }),

  pushStyleChange: (nodeId, cssProperty, value, meta) => {
    const styles = meta.styles ?? get().selected?.styles;
    const change = createChange({
      target: {
        nodeId,
        tag: meta.tag,
        path: meta.path,
        componentName: meta.componentName,
        source: resolveChangeSource(get().importId, meta),
        cssSelector: meta.cssSelector,
      },
      kind: 'style',
      payload: {
        cssProperty,
        value,
        property: cssProperty,
        previousValue: styles?.[cssProperty] ?? '',
        selector: meta.cssSelector ?? '',
      },
    });

    const pending = get().pendingChanges;
    const snapshotsBefore = buildSnapshots(pending);
    const snapshots = buildSnapshots([...pending, change]);
    const entry: HistoryEntry = {
      id: `h_${Date.now()}`,
      label: `${cssProperty} → ${value}`,
      snapshots,
      snapshotsBefore,
      changes: [change],
    };

    pushHistoryEntry(get, set, entry, nodeId, {
      styles: {
        ...(get().selected?.styles ?? {}),
        [cssProperty]: value,
      },
    });
  },

  pushPropChange: (nodeId, prop, value) => {
    const sel = get().selected;
    const change = createChange({
      target: {
        nodeId,
        componentName: sel?.componentName,
        source: resolveChangeSource(get().importId, sel ?? undefined),
      },
      kind: 'prop',
      payload: { prop, value },
    });
    set({ pendingChanges: [...get().pendingChanges, change] });
  },

  pushReorderChange: (parentId, childIds, meta) => {
    const change = createChange({
      target: {
        nodeId: parentId,
        source: resolveChangeSource(get().importId, meta),
      },
      kind: 'reorder',
      payload: { childIds, parentId },
    });
    set({ pendingChanges: [...get().pendingChanges, change] });
  },

  pushTextChange: (nodeId, text, previousText, meta) => {
    const change = createChange({
      target: {
        nodeId,
        tag: meta.tag,
        path: meta.path,
        componentName: meta.componentName,
        cssSelector: meta.cssSelector,
        source: resolveChangeSource(get().importId, meta),
      },
      kind: 'text',
      payload: { text, previousText },
    });

    const pending = get().pendingChanges;
    const snapshotsBefore = withNodeText(buildSnapshots(pending), nodeId, previousText);
    const snapshots = buildSnapshots([...pending, change]);
    const preview =
      text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const entry: HistoryEntry = {
      id: `h_${Date.now()}`,
      label: `文本 → ${preview}`,
      snapshots,
      snapshotsBefore,
      changes: [change],
    };

    pushHistoryEntry(get, set, entry, nodeId, { textContent: text });
  },

  updateSelectedText: (text) => {
    const sel = get().selected;
    if (!sel) return;
    set({
      selected: { ...sel, textContent: text },
    });
  },

  pushMediaChange: (nodeId, attr, value, previousValue, meta) => {
    const change = createChange({
      target: {
        nodeId,
        tag: meta.tag,
        path: meta.path,
        componentName: meta.componentName,
        cssSelector: meta.cssSelector,
        source: resolveChangeSource(get().importId, meta),
      },
      kind: 'media',
      payload: { attr, value, previousValue },
    });

    const pending = get().pendingChanges;
    const snapshotsBefore = withNodeMedia(buildSnapshots(pending), nodeId, { [attr]: previousValue });
    const snapshots = buildSnapshots([...pending, change]);
    const preview = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    const entry: HistoryEntry = {
      id: `h_${Date.now()}`,
      label: `${attr} → ${preview}`,
      snapshots,
      snapshotsBefore,
      changes: [change],
    };

    const sel = get().selected;
    const mediaFields =
      sel?.id === nodeId && sel.mediaFields
        ? sel.mediaFields.map((f) => (f.name === attr ? { ...f, value } : f))
        : sel?.mediaFields;

    pushHistoryEntry(get, set, entry, nodeId, mediaFields ? { mediaFields } : undefined);
  },

  updateSelectedMediaField: (attr, value) => {
    const sel = get().selected;
    if (!sel?.mediaFields) return;
    set({
      selected: {
        ...sel,
        mediaFields: sel.mediaFields.map((f) => (f.name === attr ? { ...f, value } : f)),
      },
    });
  },

  canUndo: () => get().historyIndex >= 0,

  canRedo: () => {
    const idx = get().historyIndex;
    return idx >= 0 && idx < get().history.length - 1;
  },

  undo: () => {
    const idx = get().historyIndex;
    if (idx < 0) return null;
    const entry = get().history[idx];
    const target = entry.snapshotsBefore ?? (idx > 0 ? get().history[idx - 1].snapshots : []);
    const newIdx = idx - 1;
    const history = get().history;
    set({
      historyIndex: newIdx,
      pendingChanges:
        newIdx < 0 ? [] : history.slice(0, newIdx + 1).flatMap((e) => e.changes),
    });
    syncSelectedAfterRestore(get, set, target);
    return target;
  },

  redo: () => {
    const idx = get().historyIndex;
    const history = get().history;
    if (idx >= history.length - 1) return null;
    const nextIdx = idx + 1;
    const target = history[nextIdx].snapshots;
    set({
      historyIndex: nextIdx,
      pendingChanges: history.slice(0, nextIdx + 1).flatMap((e) => e.changes),
    });
    syncSelectedAfterRestore(get, set, target);
    return target;
  },

  openDiff: () => {
    const { pendingChanges: changes, importId, pageLabel } = get();
    if (changes.length === 0) return;
    set({ diffOpen: true, diffLoading: true, hunks: [] });

    const localFallback = () => {
      const hunks = importId
        ? buildImportPageDiffs(changes, importId, pageLabel)
        : generateHunks(changes, config as typeof config);
      set({ hunks: hunksWithSideBySide(hunks), diffLoading: false });
    };

    void (async () => {
      try {
        const res = await fetch(appUrl('/api/diff/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes, importId: importId ?? undefined }),
        });
        const data = (await res.json()) as { ok?: boolean; hunks?: FileHunk[] };
        if (data.ok && data.hunks && data.hunks.length > 0) {
          set({ hunks: hunksWithSideBySide(data.hunks), diffLoading: false });
          return;
        }
      } catch {
        /* 回退到本地摘要 */
      }
      localFallback();
    })();
  },

  closeDiff: () => set({ diffOpen: false }),

  toggleHunk: (id) =>
    set({
      hunks: get().hunks.map((h) => (h.id === id ? { ...h, selected: !h.selected } : h)),
    }),

  clearPending: () =>
    set({
      pendingChanges: [],
      hunks: [],
      diffOpen: false,
      history: [],
      historyIndex: -1,
      applyNote: '',
    }),
}));
