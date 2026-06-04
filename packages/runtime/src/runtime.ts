import type {
  ConsoleEntry,
  DomTreeNode,
  EditorMode,
  MediaFieldSchema,
  MediaKind,
  PropFieldSchema,
  RuntimeToShellMessage,
  SelectedNode,
  ShellToRuntimeMessage,
  StyleSnapshot,
  ThemeMode,
} from '@ve/core';
import { VE_CHANNEL, acceptVePostMessageOrigin } from '@ve/core';
import { createNetworkMonitor } from './networkMonitor';
import { removeLayoutOverlay, updateLayoutOverlay } from './layoutOverlay';

const HOVER_CLASS = 've-hover';
const SELECT_CLASS = 've-selected';
const DRAGGING_CLASS = 've-dragging';
const DROP_TARGET_CLASS = 've-drop-target';
const DROP_BEFORE_CLASS = 've-drop-before';
const DROP_AFTER_CLASS = 've-drop-after';
const TEXT_EDIT_CLASS = 've-text-editing';

const NON_TEXT_EDIT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'NOSCRIPT',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'IMG',
  'SVG',
  'PATH',
  'BR',
  'HR',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'IFRAME',
  'OBJECT',
  'EMBED',
]);

let selectedId: string | null = null;
let editingEl: HTMLElement | null = null;
let editingOriginalText = '';
let editingBlurHandler: (() => void) | null = null;
let editorMode: EditorMode = 'inspect';
let styleOverrides = new Map<string, Record<string, string>>();
/** 媒体地址替换：导出时同步更新内联 script 中的旧 URL */
const urlReplacements = new Map<string, string>();
let dragSourceId: string | null = null;
let booted = false;
let treeObserver: MutationObserver | null = null;
let treeSyncTimer: ReturnType<typeof setTimeout> | null = null;
let networkMonitor: ReturnType<typeof createNetworkMonitor> | null = null;

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT']);

/** 行内容器：允许无子元素时编辑，或仅含行内标签子元素 */
const TEXT_CONTAINER_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'SPAN', 'A', 'BUTTON', 'LABEL',
  'LI', 'TD', 'TH', 'DT', 'DD',
  'FIGCAPTION', 'BLOCKQUOTE', 'LEGEND', 'CAPTION',
]);

const INLINE_PHRASING_TAGS = new Set([
  'SPAN', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'SMALL', 'MARK',
  'SUB', 'SUP', 'ABBR', 'CITE', 'CODE', 'KBD', 'S', 'DEL', 'INS', 'LABEL', 'BR',
]);

function getShellOrigin(): string {
  return '*';
}

function post(msg: RuntimeToShellMessage) {
  window.parent.postMessage({ channel: VE_CHANNEL, ...msg }, getShellOrigin());
}

function broadcastTree() {
  if (!document.body) return;
  ensureIds();
  const tree = buildTree(document.body);
  post({ type: 'VE_TREE_UPDATED', tree: tree ? [tree] : [] });
}

function scheduleTreeSync() {
  if (treeSyncTimer) return;
  treeSyncTimer = setTimeout(() => {
    treeSyncTimer = null;
    if (!booted || !document.body) return;
    broadcastTree();
  }, 120);
}

function startTreeObserver() {
  if (treeObserver || !document.body) return;
  treeObserver = new MutationObserver(() => scheduleTreeSync());
  treeObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-ve-id', 'class'],
  });
  scheduleTreeSync();
}

function sendReadyTree() {
  if (!document.body) return;
  ensureIds();
  const tree = buildTree(document.body);
  post({ type: 'VE_READY', tree: tree ? [tree] : [] });
}

function ensureIds(root: Element = document.body) {
  let counter = 0;
  const walk = (el: Element) => {
    if (SKIP_TAGS.has(el.tagName) || el.getAttribute('data-ve-ignore') === 'true') return;
    if (!el.getAttribute('data-ve-id')) {
      const tag = el.tagName.toLowerCase();
      el.setAttribute('data-ve-id', `ve-${tag}-${++counter}`);
    }
    Array.from(el.children).forEach((c) => walk(c));
  };
  walk(root);
}

function getPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    if (cur === document.documentElement) break;
    const id = cur.getAttribute('data-ve-id');
    if (cur === document.body) {
      parts.unshift(id ? `body#${id}` : 'body');
      break;
    }
    if (id) parts.unshift(`${cur.tagName.toLowerCase()}#${id}`);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function selectElementById(nodeId: string) {
  if (editingEl) finishTextEdit(true);
  const el = findById(nodeId) ?? (document.body.getAttribute('data-ve-id') === nodeId ? document.body : null);
  if (!el) return;
  selectedId = nodeId;
  clearHighlightClasses();
  el.classList.add(SELECT_CLASS);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  updateLayoutOverlay(el as HTMLElement);
  post({ type: 'VE_SELECT', node: toSelectedNode(el), multi: false });
}

/** 图层树标签：仅 HTML 标签名，不含文案与组件名 */
function getLabel(el: Element): string {
  return el.tagName.toLowerCase();
}

function buildTree(el: Element): DomTreeNode | null {
  if (SKIP_TAGS.has(el.tagName) || el.getAttribute('data-ve-ignore') === 'true') return null;
  let id = el.getAttribute('data-ve-id');
  if (!id) {
    const tag = el.tagName.toLowerCase();
    id = `ve-${tag}-${Math.random().toString(36).slice(2, 9)}`;
    el.setAttribute('data-ve-id', id);
  }
  const children: DomTreeNode[] = [];
  Array.from(el.children).forEach((c) => {
    const n = buildTree(c);
    if (n) children.push(n);
  });
  return { id, tag: el.tagName.toLowerCase(), label: getLabel(el), children };
}

const STYLE_KEYS = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'flex',
  'flexGrow',
  'flexShrink',
  'gap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'color',
  'backgroundColor',
  'backgroundImage',
  'border',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderRadius',
  'boxShadow',
  'opacity',
  'overflow',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'transform',
  'transition',
  'cursor',
] as const;

/** 计算后多为 px，不能当作作者 width/height 展示（会与 auto/100% 等预设冲突） */
const DIMENSIONAL_STYLE_KEYS = new Set([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
]);

function getComputedStyleMap(el: Element): Record<string, string> {
  const html = el as HTMLElement;
  const id = el.getAttribute('data-ve-id');
  const overrides = (id && styleOverrides.get(id)) || {};
  const out: Record<string, string> = {};

  STYLE_KEYS.forEach((k) => {
    if (overrides[k]) {
      out[k] = overrides[k]!;
      return;
    }
    const inline = html.style.getPropertyValue(toStylePropName(k));
    if (inline) {
      out[k] = inline;
      return;
    }
    if (DIMENSIONAL_STYLE_KEYS.has(k)) return;

    const cs = window.getComputedStyle(el);
    const v = (cs as CSSStyleDeclaration)[k as keyof CSSStyleDeclaration];
    if (typeof v === 'string' && v) out[k] = v;
  });

  return out;
}

function parsePropsSchema(el: Element): PropFieldSchema[] | undefined {
  const raw = el.getAttribute('data-ve-props');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PropFieldSchema[];
  } catch {
    return undefined;
  }
}

function readPropValue(el: Element, field: PropFieldSchema): unknown {
  const attr = el.getAttribute(`data-ve-prop-${field.name}`);
  if (attr === null) return field.value;
  if (field.type === 'boolean') return attr === 'true' || attr === '';
  if (field.type === 'number') {
    const n = Number(attr);
    return Number.isFinite(n) ? n : field.value;
  }
  return attr;
}

function readPropsSchema(el: Element): PropFieldSchema[] | undefined {
  const schema = parsePropsSchema(el);
  if (!schema) return undefined;
  return schema.map((p) => ({ ...p, value: readPropValue(el, p) }));
}

function applyPropSideEffect(el: HTMLElement, name: string, value: unknown) {
  const tag = el.tagName;
  if (name === 'disabled' && (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) {
    if (value) el.setAttribute('disabled', 'disabled');
    else el.removeAttribute('disabled');
    return;
  }
  if (name === 'variant' && tag === 'BUTTON') {
    const v = String(value);
    el.className = el.className
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('demo-btn--'))
      .join(' ');
    if (!el.classList.contains('demo-btn')) el.classList.add('demo-btn');
    el.classList.add(`demo-btn--${v}`);
    return;
  }
  if (typeof value === 'boolean') {
    if (value) el.setAttribute(name, '');
    else el.removeAttribute(name);
  } else {
    el.setAttribute(name, String(value));
  }
}

function applyPropsToElement(nodeId: string, props: Record<string, unknown>) {
  const el = findById(nodeId) as HTMLElement | null;
  if (!el) return;
  Object.entries(props).forEach(([k, v]) => {
    el.setAttribute(`data-ve-prop-${k}`, String(v));
    applyPropSideEffect(el, k, v);
  });
  if (selectedId === nodeId) {
    clearHighlightClasses();
    el.classList.add(SELECT_CLASS);
    post({ type: 'VE_SELECT', node: toSelectedNode(el), multi: false });
  }
  broadcastTree();
}

function getCssSelector(el: Element): string {
  const skip = new Set([HOVER_CLASS, SELECT_CLASS, DRAGGING_CLASS, DROP_TARGET_CLASS, DROP_BEFORE_CLASS, DROP_AFTER_CLASS, TEXT_EDIT_CLASS]);
  const classes = Array.from(el.classList).filter((c) => !c.startsWith('ve-') && !skip.has(c));
  if (classes.length > 0) {
    return classes.map((c) => `.${c.replace(/:/g, '\\:')}`).join('');
  }
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const pClasses = Array.from(parent.classList).filter((c) => c.startsWith('demo-') || c.startsWith('app-'));
    if (pClasses.length > 0) {
      return `.${pClasses[0]} ${el.tagName.toLowerCase()}`;
    }
    parent = parent.parentElement;
  }
  return el.tagName.toLowerCase();
}

function parseSource(el: Element): SelectedNode['source'] | undefined {
  const raw = el.getAttribute('data-ve-source');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isTextEditable(el: Element): boolean {
  const tag = el.tagName;
  if (NON_TEXT_EDIT_TAGS.has(tag)) return false;

  const elementChildren = Array.from(el.children);
  if (elementChildren.length === 0) {
    return TEXT_CONTAINER_TAGS.has(tag) || (el.textContent ?? '').trim().length > 0;
  }

  return elementChildren.every(
    (c) => c.tagName === 'BR' || INLINE_PHRASING_TAGS.has(c.tagName)
  );
}

function eventTargetElement(e: MouseEvent): HTMLElement | null {
  const raw = e.target;
  if (!raw) return null;
  const node =
    raw.nodeType === Node.TEXT_NODE ? (raw.parentElement as Element | null) : (raw as Element);
  return node?.closest('[data-ve-id]') as HTMLElement | null ?? null;
}

function unlockContentEditableTree(el: HTMLElement) {
  el.removeAttribute('contenteditable');
  el.querySelectorAll('[contenteditable]').forEach((node) => {
    if (el.contains(node)) node.removeAttribute('contenteditable');
  });
}

function isWhitespaceOnly(text: string): boolean {
  return text.length > 0 && /^\s*$/.test(text);
}

type EditableTextSegment = { kind: 'text'; value: string } | { kind: 'inline'; value: string };

function collectEditableSegments(el: Element): EditableTextSegment[] {
  const segs: EditableTextSegment[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      segs.push({ kind: 'text', value: node.textContent ?? '' });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as Element;
    if (child.tagName === 'BR') {
      segs.push({ kind: 'text', value: '\n' });
    } else if (INLINE_PHRASING_TAGS.has(child.tagName)) {
      segs.push({ kind: 'inline', value: getEditableText(child) });
    } else {
      segs.push({ kind: 'text', value: child.textContent ?? '' });
    }
  }
  return segs;
}

/** 读取可编辑文本：去掉 HTML 折行/缩进在首尾及行内标签之间的无意义空白 */
function getEditableText(el: Element): string {
  const segs = collectEditableSegments(el);
  if (segs.length === 0) {
    return (el.textContent ?? '').replace(/^[\t\n\r ]+/, '').replace(/[\t\n\r ]+$/, '');
  }

  let start = 0;
  while (start < segs.length && segs[start].kind === 'text' && isWhitespaceOnly(segs[start].value)) {
    start++;
  }
  let end = segs.length - 1;
  while (end >= start && segs[end].kind === 'text' && isWhitespaceOnly(segs[end].value)) {
    end--;
  }

  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    const seg = segs[i];
    if (seg.kind === 'inline') {
      out.push(seg.value);
      continue;
    }
    let t = seg.value;
    if (isWhitespaceOnly(t)) {
      const prevInline = i > start && segs[i - 1].kind === 'inline';
      const nextInline = i < end && segs[i + 1].kind === 'inline';
      if (prevInline && nextInline) {
        if (t.includes(' ')) out.push(' ');
        continue;
      }
    }
    if (i === start) t = t.replace(/^[\t\n\r ]+/, '');
    if (i === end) t = t.replace(/[\t\n\r ]+$/, '');
    out.push(t);
  }
  return out.join('');
}

/** 侧栏改字时尽量保留单个 span 等行内结构（如 h2 内高亮词） */
function setElementText(el: HTMLElement, text: string) {
  const kids = Array.from(el.children).filter((c) => c.tagName !== 'BR');
  if (kids.length === 0) {
    el.textContent = text;
    return;
  }

  if (kids.length === 1 && kids[0].tagName === 'SPAN') {
    const span = kids[0] as HTMLElement;
    const oldFull = getEditableText(el);
    const oldSpan = getEditableText(span);
    const idx = oldFull.indexOf(oldSpan);
    const before = idx > 0 ? oldFull.slice(0, idx) : '';
    const after = idx >= 0 ? oldFull.slice(idx + oldSpan.length) : '';
    let middle = text;
    if (before && text.startsWith(before)) {
      middle = text.slice(before.length);
      if (after && middle.endsWith(after)) middle = middle.slice(0, middle.length - after.length);
    }
    el.textContent = '';
    if (before) el.appendChild(document.createTextNode(before));
    span.textContent = middle;
    el.appendChild(span);
    if (after) el.appendChild(document.createTextNode(after));
    return;
  }

  el.textContent = text;
}

function resolveMediaKind(el: Element): MediaKind | undefined {
  const tag = el.tagName;
  if (tag === 'IMG') return 'image';
  if (tag === 'AUDIO') return 'audio';
  if (tag === 'VIDEO') return 'video';
  if (tag === 'SOURCE') {
    const parent = el.parentElement?.tagName;
    if (parent === 'AUDIO') return 'audio';
    if (parent === 'VIDEO') return 'video';
  }
  return undefined;
}

function readMediaSrc(el: HTMLElement): string {
  const direct = el.getAttribute('src') ?? '';
  if (direct) return direct;
  const source = el.querySelector('source');
  return source?.getAttribute('src') ?? '';
}

function readMediaFields(el: HTMLElement, kind: MediaKind): MediaFieldSchema[] {
  const fields: MediaFieldSchema[] = [];
  if (kind === 'image' && el.tagName === 'IMG') {
    fields.push({ name: 'src', label: '图片地址', value: el.getAttribute('src') ?? '' });
    fields.push({ name: 'alt', label: '替代文本', value: el.getAttribute('alt') ?? '' });
    return fields;
  }
  if (kind === 'audio') {
    fields.push({ name: 'src', label: '音频地址', value: readMediaSrc(el) });
    return fields;
  }
  if (kind === 'video') {
    fields.push({ name: 'src', label: '视频地址', value: readMediaSrc(el) });
    if (el.tagName === 'VIDEO' && el.hasAttribute('poster')) {
      fields.push({ name: 'poster', label: '封面图', value: el.getAttribute('poster') ?? '' });
    }
    return fields;
  }
  return fields;
}

function recordUrlReplacement(oldUrl: string, newUrl: string) {
  if (!oldUrl || !newUrl || oldUrl === newUrl) return;
  urlReplacements.forEach((v, k) => {
    if (v === oldUrl) urlReplacements.set(k, newUrl);
  });
  urlReplacements.set(oldUrl, newUrl);
}

function readMediaAttrBefore(el: HTMLElement, name: string): string {
  if (name === 'poster') return el.getAttribute('poster') ?? '';
  if (name === 'alt') return el.getAttribute('alt') ?? '';
  return readMediaSrc(el);
}

function setMediaAttribute(el: HTMLElement, name: string, value: string) {
  const trimmed = value.trim();
  const oldUrl =
    name === 'src' || name === 'poster' ? readMediaAttrBefore(el, name) : '';

  if (!trimmed) {
    el.removeAttribute(name);
    if (name === 'src') {
      if (el.tagName === 'IMG') (el as HTMLImageElement).removeAttribute('src');
      if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
        el.querySelectorAll('source').forEach((s) => s.removeAttribute('src'));
      }
    }
    return;
  }

  if (oldUrl && (name === 'src' || name === 'poster')) {
    recordUrlReplacement(oldUrl, trimmed);
  }

  el.setAttribute(name, trimmed);
  if (name === 'src') {
    if (el.tagName === 'IMG') {
      (el as HTMLImageElement).src = trimmed;
      return;
    }
    if (el.tagName === 'SOURCE') return;
    if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') {
      let source = el.querySelector('source');
      if (!source) {
        source = document.createElement('source');
        el.appendChild(source);
      }
      source.setAttribute('src', trimmed);
    }
  }
}

function applyMediaToElement(nodeId: string, attrs: Record<string, string>) {
  const el = findById(nodeId) as HTMLElement | null;
  if (!el || !resolveMediaKind(el)) return;
  Object.entries(attrs).forEach(([name, value]) => setMediaAttribute(el, name, value));
  if (selectedId === nodeId) {
    clearHighlightClasses();
    el.classList.add(SELECT_CLASS);
    post({ type: 'VE_SELECT', node: toSelectedNode(el), multi: false });
  }
  broadcastTree();
}

function toSelectedNode(el: Element): SelectedNode {
  const id = el.getAttribute('data-ve-id')!;
  const editable = isTextEditable(el);
  const mediaKind = resolveMediaKind(el);
  const htmlEl = el as HTMLElement;
  return {
    id,
    tag: el.tagName.toLowerCase(),
    path: getPath(el),
    componentName: el.getAttribute('data-ve-component') ?? undefined,
    source: parseSource(el),
    cssSelector: getCssSelector(el),
    styles: getComputedStyleMap(el),
    propsSchema: readPropsSchema(el),
    textContent: editable ? getEditableText(el) : undefined,
    textEditable: editable,
    mediaKind,
    mediaFields: mediaKind ? readMediaFields(htmlEl, mediaKind) : undefined,
  };
}

function findById(id: string): Element | null {
  return document.querySelector(`[data-ve-id="${id}"]`);
}

function clearHighlightClasses() {
  document.querySelectorAll(
    `.${HOVER_CLASS}, .${SELECT_CLASS}, .${DROP_TARGET_CLASS}, .${DROP_BEFORE_CLASS}, .${DROP_AFTER_CLASS}`
  ).forEach((e) => {
    e.classList.remove(
      HOVER_CLASS,
      SELECT_CLASS,
      DROP_TARGET_CLASS,
      DROP_BEFORE_CLASS,
      DROP_AFTER_CLASS
    );
  });
}

function syncStructureDraggable(on: boolean) {
  document.querySelectorAll('[data-ve-id]').forEach((el) => {
    (el as HTMLElement).draggable = on;
  });
}

function injectStyles() {
  if (document.getElementById('ve-runtime-styles')) return;
  const s = document.createElement('style');
  s.id = 've-runtime-styles';
  s.textContent = `
    .${HOVER_CLASS} { outline: 2px dashed rgba(62, 207, 142, 0.55) !important; outline-offset: 2px; }
    .${SELECT_CLASS} { outline: 2px solid #3ecf8e !important; outline-offset: 2px; }
    .${DRAGGING_CLASS} { opacity: 0.45 !important; }
    .${DROP_TARGET_CLASS} { outline: 2px dashed #6c9eff !important; outline-offset: 4px; }
    .${DROP_BEFORE_CLASS} { box-shadow: inset 0 3px 0 0 #3ecf8e !important; }
    .${DROP_AFTER_CLASS} { box-shadow: inset 0 -3px 0 0 #3ecf8e !important; }
    [data-ve-mode="structure"] [data-ve-id] { cursor: grab; user-select: none; }
    [data-ve-mode="structure"] [data-ve-id]:active { cursor: grabbing; }
    .${TEXT_EDIT_CLASS} {
      outline: 2px solid #6c9eff !important;
      outline-offset: 2px;
      cursor: text !important;
      min-width: 0.25em;
    }
    .${TEXT_EDIT_CLASS}:focus { outline: 2px solid #3ecf8e !important; }
  `;
  document.head.appendChild(s);
}

function finishTextEdit(commit: boolean) {
  if (!editingEl) return;
  const el = editingEl;
  const id = el.getAttribute('data-ve-id');
  if (commit && id) {
    const newText = getEditableText(el);
    if (newText !== editingOriginalText) {
      post({
        type: 'VE_TEXT_CHANGED',
        nodeId: id,
        text: newText,
        previousText: editingOriginalText,
      });
      broadcastTree();
    }
  } else {
    setElementText(el, editingOriginalText);
  }
  unlockContentEditableTree(el);
  el.classList.remove(TEXT_EDIT_CLASS);
  if (editingBlurHandler) {
    el.removeEventListener('blur', editingBlurHandler);
    editingBlurHandler = null;
  }
  editingEl = null;
  editingOriginalText = '';
}

function startTextEdit(el: HTMLElement) {
  if (!isTextEditable(el)) return;
  if (editingEl === el) return;
  if (editingEl) finishTextEdit(true);

  editingEl = el;
  editingOriginalText = getEditableText(el);
  unlockContentEditableTree(el);
  el.contentEditable = 'true';
  el.classList.add(TEXT_EDIT_CLASS);
  editingBlurHandler = () => finishTextEdit(true);
  el.addEventListener('blur', editingBlurHandler);
  el.focus();

  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function applyTextToElement(nodeId: string, text: string) {
  const el = findById(nodeId) as HTMLElement | null;
  if (!el || !isTextEditable(el)) return;
  if (editingEl === el) {
    editingOriginalText = text;
  }
  setElementText(el, text);
  if (editingEl !== el) broadcastTree();
}

function toStylePropName(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** 将 var(--token) 解析为计算后的颜色/长度，便于导出 HTML 独立打开仍生效 */
function resolveStyleValueForDom(value: string, el: HTMLElement): string {
  const trimmed = value.trim();
  const varMatch = trimmed.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!varMatch) return trimmed;
  const fromEl = getComputedStyle(el).getPropertyValue(varMatch[1]).trim();
  if (fromEl) return fromEl;
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim();
  return fromRoot || trimmed;
}

function applyStylesToElement(
  nodeId: string,
  styles: Record<string, string>,
  replace = false
) {
  const el = findById(nodeId);
  if (!el) return;
  const htmlEl = el as HTMLElement;
  const prev = styleOverrides.get(nodeId) ?? {};
  const next = replace ? { ...styles } : { ...prev, ...styles };
  styleOverrides.set(nodeId, next);

  if (replace) {
    htmlEl.removeAttribute('style');
  }

  Object.entries(next).forEach(([k, v]) => {
    const prop = toStylePropName(k);
    if (!v) {
      htmlEl.style.removeProperty(prop);
    } else {
      htmlEl.style.setProperty(prop, resolveStyleValueForDom(v, htmlEl));
    }
  });

  if (selectedId === nodeId) {
    clearHighlightClasses();
    htmlEl.classList.add(SELECT_CLASS);
    updateLayoutOverlay(htmlEl);
    post({ type: 'VE_SELECT', node: toSelectedNode(el), multi: false });
  }
}

function restoreSnapshots(snapshots: StyleSnapshot[]) {
  const touchedStyles = new Set<string>([...styleOverrides.keys()]);
  snapshots.forEach((s) => {
    if (Object.keys(s.styles).length > 0) touchedStyles.add(s.nodeId);
  });

  styleOverrides.clear();
  touchedStyles.forEach((id) => {
    const el = findById(id);
    if (el) (el as HTMLElement).removeAttribute('style');
  });

  snapshots.forEach(({ nodeId, styles, textContent, mediaAttrs }) => {
    if (textContent !== undefined) {
      applyTextToElement(nodeId, textContent);
    }
    if (mediaAttrs && Object.keys(mediaAttrs).length > 0) {
      applyMediaToElement(nodeId, mediaAttrs);
    }
    if (Object.keys(styles).length > 0) {
      applyStylesToElement(nodeId, styles, true);
    }
  });

  if (selectedId) {
    const el = findById(selectedId);
    if (el) {
      clearHighlightClasses();
      (el as HTMLElement).classList.add(SELECT_CLASS);
      post({ type: 'VE_SELECT', node: toSelectedNode(el), multi: false });
    }
  }
}

function reorderNode(nodeId: string, targetId: string, position: 'before' | 'after') {
  const node = findById(nodeId);
  const target = findById(targetId);
  if (!node || !target || node === target) return;
  const parent = target.parentElement;
  if (!parent || node.parentElement !== parent) return;
  if (position === 'before') {
    parent.insertBefore(node, target);
  } else {
    parent.insertBefore(node, target.nextSibling);
  }
  const parentId = parent.getAttribute('data-ve-id') ?? 'body';
  const childIds = Array.from(parent.children)
    .map((c) => c.getAttribute('data-ve-id'))
    .filter(Boolean) as string[];
  post({ type: 'VE_REORDERED', nodeId, parentId, childIds });
  broadcastTree();
}

const VE_ATTR_PREFIX = 'data-ve-';

function syncStyleOverridesBeforeExport() {
  styleOverrides.forEach((styles, nodeId) => {
    applyStylesToElement(nodeId, styles, true);
  });
}

/** 导出前把内联 style 里的 var() 固化为 rgb/px 等计算值 */
function materializeCssVariablesOnTree(root: ParentNode) {
  root.querySelectorAll('[style]').forEach((node) => {
    const el = node as HTMLElement;
    const style = el.style;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const val = style.getPropertyValue(prop);
      if (!val.includes('var(')) continue;
      const resolved = resolveStyleValueForDom(val, el);
      if (resolved && resolved !== val) {
        style.setProperty(prop, resolved);
      }
    }
  });
}

function cleanExportClone(root: ParentNode) {
  const removeSelectors = [
    '#ve-runtime-styles',
    '#ve-layout-overlay',
    'script[data-ve-ignore="true"]',
    'script[src*="ve-runtime"]',
  ];
  removeSelectors.forEach((sel) => {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  });

  root.querySelectorAll('script').forEach((script) => {
    const text = script.textContent ?? '';
    if (
      text.includes('visual-editor') ||
      text.includes(VE_CHANNEL) ||
      text.includes('ve-runtime.js')
    ) {
      script.remove();
    }
  });

  root.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;
    el.classList.remove(
      HOVER_CLASS,
      SELECT_CLASS,
      DRAGGING_CLASS,
      DROP_TARGET_CLASS,
      DROP_BEFORE_CLASS,
      DROP_AFTER_CLASS,
      TEXT_EDIT_CLASS
    );
    if (el.draggable) el.draggable = false;
    if (el.isContentEditable) el.contentEditable = 'false';

    Array.from(el.attributes).forEach((attr) => {
      if (attr.name === 'data-ve-mode') {
        el.removeAttribute(attr.name);
        return;
      }
      if (attr.name.startsWith('data-ve-prop-')) {
        const prop = attr.name.slice('data-ve-prop-'.length);
        if (prop) el.setAttribute(prop, attr.value);
        el.removeAttribute(attr.name);
        return;
      }
      if (attr.name.startsWith(VE_ATTR_PREFIX)) {
        el.removeAttribute(attr.name);
      }
    });
  });
}

function applyUrlReplacementsToHtml(html: string): string {
  let out = html;
  urlReplacements.forEach((newUrl, oldUrl) => {
    if (oldUrl && newUrl && oldUrl !== newUrl) {
      out = out.split(oldUrl).join(newUrl);
    }
  });
  return out;
}

function syncMediaAttributesBeforeExport(root: ParentNode) {
  root.querySelectorAll('img[src], video[src], audio[src]').forEach((node) => {
    const el = node as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    const attr = el.getAttribute('src');
    if (attr) el.src = attr;
  });
  root.querySelectorAll('video[poster]').forEach((node) => {
    const el = node as HTMLVideoElement;
    const poster = el.getAttribute('poster');
    if (poster) el.poster = poster;
  });
}

function exportDocumentHtml(): string {
  syncStyleOverridesBeforeExport();
  syncMediaAttributesBeforeExport(document.documentElement);
  materializeCssVariablesOnTree(document.documentElement);
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  cleanExportClone(clone);
  syncMediaAttributesBeforeExport(clone);

  const base = clone.querySelector('base');
  if (base) {
    const href = base.getAttribute('href') ?? '';
    if (
      href.startsWith('http://localhost') ||
      href.startsWith('http://127.0.0.1') ||
      href === 'about:blank'
    ) {
      base.remove();
    }
  }

  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>`
    : '<!DOCTYPE html>';

  return applyUrlReplacementsToHtml(`${doctype}\n${clone.outerHTML}`);
}

function shouldApplyShellTheme(): boolean {
  const root = document.documentElement;
  if (root.hasAttribute('data-ve-ignore-shell-theme')) return false;
  if (root.hasAttribute('data-ve-allow-shell-theme')) return true;
  return true;
}

function setTheme(theme: ThemeMode | 'toggle') {
  if (!shouldApplyShellTheme()) return;
  const root = document.documentElement;
  let next: ThemeMode = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  if (theme === 'toggle') {
    next = next === 'light' ? 'dark' : 'light';
  } else {
    next = theme;
  }
  root.setAttribute('data-theme', next);
  post({ type: 'VE_THEME', theme: next });
}

function hookConsole() {
  const levels = ['log', 'warn', 'error', 'info'] as const;
  levels.forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      const entry: ConsoleEntry = {
        id: `c_${Date.now()}`,
        level: level === 'info' ? 'log' : level,
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        timestamp: new Date().toISOString(),
      };
      post({ type: 'VE_CONSOLE', entry });
    };
  });
}

function handleClick(e: MouseEvent) {
  if (window.parent === window || editorMode === 'structure') return;

  if (editingEl && !editingEl.contains(e.target as Node)) {
    finishTextEdit(true);
  }

  const target = eventTargetElement(e);
  if (!target) return;
  e.preventDefault();
  e.stopPropagation();
  selectedId = target.getAttribute('data-ve-id');
  clearHighlightClasses();
  target.classList.add(SELECT_CLASS);
  updateLayoutOverlay(target);
  post({ type: 'VE_SELECT', node: toSelectedNode(target), multi: e.ctrlKey || e.metaKey });
}

function handleDblClick(e: MouseEvent) {
  if (window.parent === window || editorMode === 'structure') return;
  const target = eventTargetElement(e);
  if (!target || !isTextEditable(target)) return;
  e.preventDefault();
  e.stopPropagation();
  selectedId = target.getAttribute('data-ve-id');
  clearHighlightClasses();
  target.classList.add(SELECT_CLASS);
  updateLayoutOverlay(target);
  post({ type: 'VE_SELECT', node: toSelectedNode(target), multi: false });
  startTextEdit(target);
}

function handleTextEditKeydown(e: KeyboardEvent) {
  if (!editingEl) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    finishTextEdit(false);
  } else if (e.key === 'Enter' && !e.shiftKey) {
    const tag = editingEl.tagName;
    if (!['P', 'DIV', 'TEXTAREA', 'LI'].includes(tag)) {
      e.preventDefault();
      e.stopPropagation();
      finishTextEdit(true);
    }
  }
}

function handleMouseOver(e: MouseEvent) {
  if (window.parent === window || editingEl) return;
  const target = (e.target as Element).closest('[data-ve-id]');
  const id = target?.getAttribute('data-ve-id');
  if (!id || id === selectedId) return;
  if (editorMode !== 'structure') {
    document.querySelectorAll(`.${HOVER_CLASS}`).forEach((el) => {
      if (!el.classList.contains(SELECT_CLASS)) el.classList.remove(HOVER_CLASS);
    });
    target?.classList.add(HOVER_CLASS);
  }
  post({ type: 'VE_HOVER', nodeId: id });
}

function resolveDragSource(start: Element | null): HTMLElement | null {
  if (!start) return null;
  let target = start.closest('[data-ve-id]') as HTMLElement | null;
  if (!target) return null;
  if (selectedId) {
    const selected = findById(selectedId) as HTMLElement | null;
    if (selected?.contains(target)) return selected;
  }
  return target;
}

function handleDragStart(e: DragEvent) {
  if (editorMode !== 'structure') return;
  const target = resolveDragSource(e.target as Element);
  if (!target) return;
  dragSourceId = target.getAttribute('data-ve-id');
  target.classList.add(DRAGGING_CLASS);
  e.dataTransfer?.setData('text/ve-id', dragSourceId ?? '');
  e.dataTransfer!.effectAllowed = 'move';
}

function clearDropIndicators() {
  document
    .querySelectorAll(`.${DROP_TARGET_CLASS}, .${DROP_BEFORE_CLASS}, .${DROP_AFTER_CLASS}`)
    .forEach((el) => {
      el.classList.remove(DROP_TARGET_CLASS, DROP_BEFORE_CLASS, DROP_AFTER_CLASS);
    });
}

function toastWarn(message: string) {
  post({
    type: 'VE_CONSOLE',
    entry: {
      id: `toast_${Date.now()}`,
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

function handleDragOver(e: DragEvent) {
  if (editorMode !== 'structure' || !dragSourceId) return;
  const target = (e.target as Element).closest('[data-ve-id]');
  if (!target || target.getAttribute('data-ve-id') === dragSourceId) return;

  const src = findById(dragSourceId);
  if (!src?.parentElement || src.parentElement !== target.parentElement) {
    e.dataTransfer!.dropEffect = 'none';
    clearDropIndicators();
    return;
  }

  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  clearDropIndicators();
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  target.classList.add(DROP_TARGET_CLASS);
  target.classList.add(before ? DROP_BEFORE_CLASS : DROP_AFTER_CLASS);
}

function handleDrop(e: DragEvent) {
  if (editorMode !== 'structure' || !dragSourceId) return;
  e.preventDefault();
  const target = (e.target as Element).closest('[data-ve-id]');
  document.querySelectorAll(`.${DRAGGING_CLASS}`).forEach((el) => el.classList.remove(DRAGGING_CLASS));
  clearDropIndicators();
  if (!target) {
    dragSourceId = null;
    return;
  }

  const src = findById(dragSourceId);
  if (!src?.parentElement || src.parentElement !== target.parentElement) {
    toastWarn('只能在同一容器内调整同级元素顺序');
    dragSourceId = null;
    return;
  }

  const targetId = target.getAttribute('data-ve-id')!;
  const rect = target.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  reorderNode(dragSourceId, targetId, before ? 'before' : 'after');
  dragSourceId = null;
}

function handleDragEnd() {
  dragSourceId = null;
  document.querySelectorAll(`.${DRAGGING_CLASS}`).forEach((el) => el.classList.remove(DRAGGING_CLASS));
  clearDropIndicators();
}

function onMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || data.channel !== VE_CHANNEL) return;
  if (!acceptVePostMessageOrigin(event.origin, window.location.origin)) return;
  const msg = data as ShellToRuntimeMessage & { channel: string };

  switch (msg.type) {
    case 'VE_INIT':
      if (!booted && window.parent !== window) {
        initVisualEditorRuntime();
      }
      ensureIds();
      if (booted) {
        sendReadyTree();
        scheduleTreeSync();
      }
      break;
    case 'VE_SET_MODE':
      editorMode = msg.mode;
      document.documentElement.setAttribute('data-ve-mode', msg.mode);
      syncStructureDraggable(msg.mode === 'structure');
      break;
    case 'VE_HIGHLIGHT': {
      clearHighlightClasses();
      if (msg.nodeId) {
        const el = findById(msg.nodeId);
        if (el) {
          el.classList.add(SELECT_CLASS);
          selectedId = msg.nodeId;
          updateLayoutOverlay(el as HTMLElement);
        }
      } else {
        selectedId = null;
        removeLayoutOverlay();
      }
      break;
    }
    case 'VE_APPLY_STYLE':
      applyStylesToElement(msg.nodeId, msg.styles);
      break;
    case 'VE_APPLY_PROPS':
      applyPropsToElement(msg.nodeId, msg.props);
      break;
    case 'VE_RESTORE':
      restoreSnapshots(msg.snapshots);
      break;
    case 'VE_REORDER':
      reorderNode(msg.nodeId, msg.targetId, msg.position);
      break;
    case 'VE_SET_THEME':
      setTheme(msg.theme);
      break;
    case 'VE_EXPORT_HTML':
      post({ type: 'VE_HTML_EXPORT', html: exportDocumentHtml() });
      break;
    case 'VE_START_TEXT_EDIT': {
      const el = findById(msg.nodeId) as HTMLElement | null;
      if (el) startTextEdit(el);
      break;
    }
    case 'VE_APPLY_TEXT':
      applyTextToElement(msg.nodeId, msg.text);
      break;
    case 'VE_APPLY_MEDIA':
      applyMediaToElement(msg.nodeId, msg.attrs);
      break;
    case 'VE_SELECT_NODE':
      selectElementById(msg.nodeId);
      break;
  }
}

export function initVisualEditorRuntime() {
  if (window.parent === window) return;
  if (booted) {
    sendReadyTree();
    return;
  }

  const boot = () => {
    if (booted) {
      sendReadyTree();
      return;
    }
    booted = true;
    ensureIds();
    injectStyles();
    hookConsole();
    networkMonitor = createNetworkMonitor(post);
    const syncOverlayOnScroll = () => {
      if (!selectedId) return;
      const el = findById(selectedId) as HTMLElement | null;
      if (el) updateLayoutOverlay(el);
    };
    window.addEventListener('scroll', syncOverlayOnScroll, true);
    window.addEventListener('resize', syncOverlayOnScroll);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('dblclick', handleDblClick, true);
    document.addEventListener('keydown', handleTextEditKeydown, true);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
    syncStructureDraggable(editorMode === 'structure');
    window.addEventListener('message', onMessage);
    sendReadyTree();
    startTreeObserver();
    post({ type: 'VE_RUNTIME_LOADED' });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

initVisualEditorRuntime();
