export type ChangeKind = 'style' | 'layout' | 'prop' | 'reorder' | 'text' | 'media';

export type EditorMode = 'inspect' | 'structure';

export type ThemeMode = 'light' | 'dark';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface ChangeTarget {
  nodeId: string;
  tag?: string;
  path?: string;
  componentName?: string;
  source?: SourceLocation;
  /** 回写 CSS 时使用的选择器，如 .demo-title */
  cssSelector?: string;
}

export interface SemanticChange {
  id: string;
  target: ChangeTarget;
  kind: ChangeKind;
  payload: Record<string, unknown>;
  previewOnly: boolean;
  createdAt: string;
}

export interface SemanticChangeSet {
  version: 1;
  projectId: string;
  changes: SemanticChange[];
  createdAt: string;
}

export interface DomTreeNode {
  id: string;
  tag: string;
  label: string;
  children: DomTreeNode[];
}

export interface PropFieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  value: unknown;
  options?: string[];
}

export type MediaKind = 'image' | 'audio' | 'video';

export interface MediaFieldSchema {
  /** 属性名：src / poster / alt */
  name: string;
  label: string;
  value: string;
}

export interface SelectedNode {
  id: string;
  tag: string;
  path: string;
  componentName?: string;
  source?: SourceLocation;
  styles: Record<string, string>;
  /** 用于 App.css 等样式表回写的选择器 */
  cssSelector?: string;
  propsSchema?: PropFieldSchema[];
  /** 当前元素文本（仅可直接编辑文本的元素） */
  textContent?: string;
  textEditable?: boolean;
  /** img / audio / video / source */
  mediaKind?: MediaKind;
  mediaFields?: MediaFieldSchema[];
}

export interface StyleSnapshot {
  nodeId: string;
  styles: Record<string, string>;
  /** 可编辑文本节点内容（有文本变更时） */
  textContent?: string;
  /** 媒体属性（src / poster / alt） */
  mediaAttrs?: Record<string, string>;
}

export interface HistoryEntry {
  id: string;
  label: string;
  /** 本条变更应用后的样式快照（撤销目标为 snapshotsBefore） */
  snapshots: StyleSnapshot[];
  snapshotsBefore: StyleSnapshot[];
  changes: SemanticChange[];
}

export interface ConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: string;
}

export type NetworkResourceType =
  | 'fetch'
  | 'xhr'
  | 'img'
  | 'script'
  | 'css'
  | 'media'
  | 'font'
  | 'other';

export interface NetworkEntry {
  id: string;
  url: string;
  method: string;
  status: number | null;
  ok: boolean;
  resourceType: NetworkResourceType;
  size: number | null;
  durationMs: number | null;
  timestamp: string;
  error?: string;
}

export interface NlpStyleIntent {
  cssProperty: string;
  value: string;
}

/** Shell → Runtime */
export type ShellToRuntimeMessage =
  | { type: 'VE_INIT' }
  | { type: 'VE_SET_MODE'; mode: EditorMode }
  | { type: 'VE_HIGHLIGHT'; nodeId: string | null }
  | { type: 'VE_APPLY_STYLE'; nodeId: string; styles: Record<string, string> }
  | { type: 'VE_APPLY_PROPS'; nodeId: string; props: Record<string, unknown> }
  | { type: 'VE_RESTORE'; snapshots: StyleSnapshot[] }
  | { type: 'VE_REORDER'; nodeId: string; targetId: string; position: 'before' | 'after' }
  | { type: 'VE_SET_THEME'; theme: ThemeMode | 'toggle' }
  | { type: 'VE_EXPORT_HTML' }
  | { type: 'VE_START_TEXT_EDIT'; nodeId: string }
  | { type: 'VE_APPLY_TEXT'; nodeId: string; text: string }
  | { type: 'VE_APPLY_MEDIA'; nodeId: string; attrs: Record<string, string> }
  | { type: 'VE_SELECT_NODE'; nodeId: string };

/** Runtime → Shell */
export type RuntimeToShellMessage =
  | { type: 'VE_READY'; tree: DomTreeNode[] }
  | { type: 'VE_SELECT'; node: SelectedNode; multi: boolean }
  | { type: 'VE_HOVER'; nodeId: string | null }
  | { type: 'VE_TREE_UPDATED'; tree: DomTreeNode[] }
  | { type: 'VE_REORDERED'; nodeId: string; parentId: string; childIds: string[] }
  | { type: 'VE_CONSOLE'; entry: ConsoleEntry }
  | { type: 'VE_THEME'; theme: ThemeMode }
  | { type: 'VE_RUNTIME_LOADED' }
  | { type: 'VE_RUNTIME_ERROR'; detail?: string }
  | { type: 'VE_HTML_EXPORT'; html: string }
  | { type: 'VE_TEXT_CHANGED'; nodeId: string; text: string; previousText: string }
  | { type: 'VE_NETWORK'; entry: NetworkEntry }
  | { type: 'VE_NETWORK_BATCH'; entries: NetworkEntry[] };

export const VE_CHANNEL = 'visual-editor';

function isPrivateLanHost(hostname: string): boolean {
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/** iframe ↔ Shell postMessage 来源校验（开发/内网测试需放行实际访问域名） */
export function isAllowedOrigin(origin: string): boolean {
  if (origin === 'null') return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname;
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '[::1]' ||
      h.endsWith('.localhost')
    ) {
      return true;
    }
    if (isPrivateLanHost(h)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Shell / Runtime 统一：白名单 + 与当前页同源（反代同域场景） */
export function acceptVePostMessageOrigin(origin: string, pageOrigin?: string): boolean {
  if (origin === 'null') return true;
  if (pageOrigin && origin === pageOrigin) return true;
  return isAllowedOrigin(origin);
}

export function createChange(
  partial: Omit<SemanticChange, 'id' | 'createdAt' | 'previewOnly'> & { previewOnly?: boolean }
): SemanticChange {
  return {
    ...partial,
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    previewOnly: partial.previewOnly ?? true,
    createdAt: new Date().toISOString(),
  };
}
