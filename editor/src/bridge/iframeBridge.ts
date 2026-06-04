import type {
  EditorMode,
  RuntimeToShellMessage,
  ShellToRuntimeMessage,
  StyleSnapshot,
  ThemeMode,
} from '@ve/core';
import { VE_CHANNEL, acceptVePostMessageOrigin } from '@ve/core';

type Handler = (msg: RuntimeToShellMessage) => void;

let iframeRef: HTMLIFrameElement | null = null;
let handler: Handler | null = null;

export function setIframeRef(el: HTMLIFrameElement | null) {
  iframeRef = el;
}

export function onRuntimeMessage(h: Handler) {
  handler = h;
}

export function initBridgeListener() {
  const listener = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.channel !== VE_CHANNEL) return;
    if (!acceptVePostMessageOrigin(event.origin, window.location.origin)) return;
    const { channel: _ch, ...msg } = data as RuntimeToShellMessage & { channel: string };
    handler?.(msg);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function postToRuntime(msg: ShellToRuntimeMessage) {
  iframeRef?.contentWindow?.postMessage({ channel: VE_CHANNEL, ...msg }, '*');
}

export function initRuntime() {
  postToRuntime({ type: 'VE_INIT' });
}

export function setEditorMode(mode: EditorMode) {
  postToRuntime({ type: 'VE_SET_MODE', mode });
}

export function highlightNode(nodeId: string | null) {
  postToRuntime({ type: 'VE_HIGHLIGHT', nodeId });
}

export function selectNodeById(nodeId: string) {
  postToRuntime({ type: 'VE_SELECT_NODE', nodeId });
}

export function applyStyle(nodeId: string, styles: Record<string, string>) {
  postToRuntime({ type: 'VE_APPLY_STYLE', nodeId, styles });
}

export function applyProps(nodeId: string, props: Record<string, unknown>) {
  postToRuntime({ type: 'VE_APPLY_PROPS', nodeId, props });
}

export function applyText(nodeId: string, text: string) {
  postToRuntime({ type: 'VE_APPLY_TEXT', nodeId, text });
}

export function applyMedia(nodeId: string, attrs: Record<string, string>) {
  postToRuntime({ type: 'VE_APPLY_MEDIA', nodeId, attrs });
}

export function startTextEdit(nodeId: string) {
  postToRuntime({ type: 'VE_START_TEXT_EDIT', nodeId });
}

export function restoreSnapshots(snapshots: StyleSnapshot[]) {
  postToRuntime({ type: 'VE_RESTORE', snapshots });
}

export function reorderNode(nodeId: string, targetId: string, position: 'before' | 'after') {
  postToRuntime({ type: 'VE_REORDER', nodeId, targetId, position });
}

export function setTheme(theme: ThemeMode | 'toggle') {
  postToRuntime({ type: 'VE_SET_THEME', theme });
}

/** 应用代码后刷新预览 iframe，使磁盘上的样式生效 */
export function reloadPreview() {
  try {
    iframeRef?.contentWindow?.location.reload();
  } catch {
    /* cross-origin */
  }
}
