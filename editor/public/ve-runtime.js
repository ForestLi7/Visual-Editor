"use strict";
(() => {
  // packages/core/dist/index.js
  var VE_CHANNEL = "visual-editor";
  function isPrivateLanHost(hostname) {
    return /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  }
  function isAllowedOrigin(origin) {
    if (origin === "null")
      return true;
    try {
      const u = new URL(origin);
      if (u.protocol !== "http:" && u.protocol !== "https:")
        return false;
      const h = u.hostname;
      if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost")) {
        return true;
      }
      if (isPrivateLanHost(h))
        return true;
      return false;
    } catch {
      return false;
    }
  }
  function acceptVePostMessageOrigin(origin, pageOrigin) {
    if (origin === "null")
      return true;
    if (pageOrigin && origin === pageOrigin)
      return true;
    return isAllowedOrigin(origin);
  }

  // packages/runtime/src/networkMonitor.ts
  var MAX_ENTRIES = 500;
  var seq = 0;
  function mapInitiatorType(t) {
    switch (t) {
      case "img":
      case "image":
        return "img";
      case "script":
        return "script";
      case "css":
      case "link":
        return "css";
      case "video":
      case "audio":
        return "media";
      case "font":
        return "font";
      case "xmlhttprequest":
        return "xhr";
      case "fetch":
        return "fetch";
      default:
        return "other";
    }
  }
  function createNetworkMonitor(post2) {
    const buffer = [];
    const push = (partial) => {
      const entry = {
        id: `net_${++seq}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        method: partial.method ?? "GET",
        status: partial.status ?? null,
        ok: partial.ok ?? (partial.status !== null && partial.status >= 200 && partial.status < 400),
        resourceType: partial.resourceType ?? "other",
        size: partial.size ?? null,
        durationMs: partial.durationMs ?? null,
        error: partial.error,
        url: partial.url
      };
      buffer.push(entry);
      if (buffer.length > MAX_ENTRIES) buffer.shift();
      post2({ type: "VE_NETWORK", entry });
    };
    const hookFetch = () => {
      const orig = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const start = performance.now();
        try {
          const res = await orig(input, init);
          const len = res.headers.get("content-length");
          push({
            url,
            method,
            status: res.status,
            ok: res.ok,
            resourceType: "fetch",
            size: len ? parseInt(len, 10) : null,
            durationMs: Math.round(performance.now() - start)
          });
          return res;
        } catch (err) {
          push({
            url,
            method,
            status: null,
            ok: false,
            resourceType: "fetch",
            durationMs: Math.round(performance.now() - start),
            error: err instanceof Error ? err.message : String(err)
          });
          throw err;
        }
      };
    };
    const hookXhr = () => {
      const XHR = XMLHttpRequest;
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      XHR.prototype.open = function(method, url, ...rest) {
        this.__veMethod = method.toUpperCase();
        this.__veUrl = String(url);
        return origOpen.apply(this, [method, url, ...rest]);
      };
      XHR.prototype.send = function(body) {
        const xhr = this;
        xhr.__veStart = performance.now();
        const onEnd = () => {
          const url = xhr.__veUrl ?? "";
          if (!url) return;
          push({
            url,
            method: xhr.__veMethod ?? "GET",
            status: xhr.status || null,
            ok: xhr.status >= 200 && xhr.status < 400,
            resourceType: "xhr",
            durationMs: Math.round(performance.now() - (xhr.__veStart ?? performance.now()))
          });
        };
        this.addEventListener("loadend", onEnd, { once: true });
        this.addEventListener("error", () => {
          push({
            url: xhr.__veUrl ?? "",
            method: xhr.__veMethod ?? "GET",
            status: null,
            ok: false,
            resourceType: "xhr",
            durationMs: Math.round(performance.now() - (xhr.__veStart ?? performance.now())),
            error: "Network error"
          });
        });
        return origSend.call(this, body);
      };
    };
    const observeResources = () => {
      try {
        const seen = /* @__PURE__ */ new Set();
        const record = (entries) => {
          entries.forEach((e) => {
            if (e.entryType !== "resource") return;
            const r = e;
            const key = `${r.name}|${r.startTime}`;
            if (seen.has(key)) return;
            seen.add(key);
            const type = mapInitiatorType(r.initiatorType || "other");
            if (type === "fetch" || type === "xhr") return;
            push({
              url: r.name,
              method: "GET",
              status: 200,
              ok: true,
              resourceType: type,
              size: r.transferSize > 0 ? r.transferSize : null,
              durationMs: Math.round(r.duration)
            });
          });
        };
        const obs = new PerformanceObserver((list) => record(list.getEntries()));
        obs.observe({ type: "resource", buffered: true });
        setTimeout(() => record(performance.getEntriesByType("resource")), 500);
      } catch {
      }
    };
    hookFetch();
    hookXhr();
    observeResources();
    return {
      flushBuffered: () => {
        if (buffer.length === 0) return;
        post2({ type: "VE_NETWORK_BATCH", entries: [...buffer] });
      }
    };
  }

  // packages/runtime/src/layoutOverlay.ts
  var OVERLAY_ID = "ve-layout-overlay";
  function ensureOverlayRoot() {
    let root = document.getElementById(OVERLAY_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = OVERLAY_ID;
      root.setAttribute("data-ve-ignore", "true");
      Object.assign(root.style, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "2147483645",
        overflow: "hidden"
      });
      document.body.appendChild(root);
    }
    return root;
  }
  function clearOverlay() {
    const root = document.getElementById(OVERLAY_ID);
    if (root) root.innerHTML = "";
  }
  function isFlexOrGrid(display) {
    const d = display.toLowerCase();
    if (d === "flex" || d === "inline-flex") return "flex";
    if (d === "grid" || d === "inline-grid") return "grid";
    return null;
  }
  function updateLayoutOverlay(el) {
    clearOverlay();
    if (!el) return;
    const computed = getComputedStyle(el);
    const mode = isFlexOrGrid(computed.display);
    if (!mode) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const root = ensureOverlayRoot();
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      border: "2px dashed rgba(62, 207, 142, 0.85)",
      borderRadius: "4px",
      boxSizing: "border-box"
    });
    const label = document.createElement("div");
    const dir = computed.flexDirection || "row";
    const gap = computed.gap || computed.columnGap || "0";
    label.textContent = mode === "flex" ? `Flex \xB7 ${dir} \xB7 gap ${gap}` : `Grid \xB7 gap ${gap}`;
    Object.assign(label.style, {
      position: "absolute",
      top: "-1.4rem",
      left: "0",
      fontSize: "11px",
      fontFamily: "system-ui, sans-serif",
      color: "#3ecf8e",
      background: "rgba(13, 15, 18, 0.85)",
      padding: "2px 6px",
      borderRadius: "4px",
      whiteSpace: "nowrap"
    });
    box.appendChild(label);
    if (mode === "flex") {
      const arrow = document.createElement("div");
      const isRow = dir.includes("row");
      Object.assign(arrow.style, {
        position: "absolute",
        left: isRow ? "8px" : "50%",
        top: isRow ? "50%" : "8px",
        width: isRow ? "40px" : "3px",
        height: isRow ? "3px" : "40px",
        background: "rgba(62, 207, 142, 0.6)",
        transform: isRow ? "translateY(-50%)" : "translateX(-50%)"
      });
      box.appendChild(arrow);
    }
    root.appendChild(box);
  }
  function removeLayoutOverlay() {
    clearOverlay();
  }

  // packages/runtime/src/runtime.ts
  var HOVER_CLASS = "ve-hover";
  var SELECT_CLASS = "ve-selected";
  var DRAGGING_CLASS = "ve-dragging";
  var DROP_TARGET_CLASS = "ve-drop-target";
  var DROP_BEFORE_CLASS = "ve-drop-before";
  var DROP_AFTER_CLASS = "ve-drop-after";
  var TEXT_EDIT_CLASS = "ve-text-editing";
  var NON_TEXT_EDIT_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "NOSCRIPT",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "IMG",
    "SVG",
    "PATH",
    "BR",
    "HR",
    "VIDEO",
    "AUDIO",
    "CANVAS",
    "IFRAME",
    "OBJECT",
    "EMBED"
  ]);
  var selectedId = null;
  var editingEl = null;
  var editingOriginalText = "";
  var editingBlurHandler = null;
  var editorMode = "inspect";
  var styleOverrides = /* @__PURE__ */ new Map();
  var urlReplacements = /* @__PURE__ */ new Map();
  var dragSourceId = null;
  var booted = false;
  var treeObserver = null;
  var treeSyncTimer = null;
  var networkMonitor = null;
  var SKIP_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);
  var TEXT_CONTAINER_TAGS = /* @__PURE__ */ new Set([
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "P",
    "SPAN",
    "A",
    "BUTTON",
    "LABEL",
    "LI",
    "TD",
    "TH",
    "DT",
    "DD",
    "FIGCAPTION",
    "BLOCKQUOTE",
    "LEGEND",
    "CAPTION"
  ]);
  var INLINE_PHRASING_TAGS = /* @__PURE__ */ new Set([
    "SPAN",
    "A",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "SMALL",
    "MARK",
    "SUB",
    "SUP",
    "ABBR",
    "CITE",
    "CODE",
    "KBD",
    "S",
    "DEL",
    "INS",
    "LABEL",
    "BR"
  ]);
  function getShellOrigin() {
    return "*";
  }
  function post(msg) {
    window.parent.postMessage({ channel: VE_CHANNEL, ...msg }, getShellOrigin());
  }
  function broadcastTree() {
    if (!document.body) return;
    ensureIds();
    const tree = buildTree(document.body);
    post({ type: "VE_TREE_UPDATED", tree: tree ? [tree] : [] });
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
      attributeFilter: ["data-ve-id", "class"]
    });
    scheduleTreeSync();
  }
  function sendReadyTree() {
    if (!document.body) return;
    ensureIds();
    const tree = buildTree(document.body);
    post({ type: "VE_READY", tree: tree ? [tree] : [] });
  }
  function ensureIds(root = document.body) {
    let counter = 0;
    const walk = (el) => {
      if (SKIP_TAGS.has(el.tagName) || el.getAttribute("data-ve-ignore") === "true") return;
      if (!el.getAttribute("data-ve-id")) {
        const tag = el.tagName.toLowerCase();
        el.setAttribute("data-ve-id", `ve-${tag}-${++counter}`);
      }
      Array.from(el.children).forEach((c) => walk(c));
    };
    walk(root);
  }
  function getPath(el) {
    const parts = [];
    let cur = el;
    while (cur) {
      if (cur === document.documentElement) break;
      const id = cur.getAttribute("data-ve-id");
      if (cur === document.body) {
        parts.unshift(id ? `body#${id}` : "body");
        break;
      }
      if (id) parts.unshift(`${cur.tagName.toLowerCase()}#${id}`);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  function selectElementById(nodeId) {
    if (editingEl) finishTextEdit(true);
    const el = findById(nodeId) ?? (document.body.getAttribute("data-ve-id") === nodeId ? document.body : null);
    if (!el) return;
    selectedId = nodeId;
    clearHighlightClasses();
    el.classList.add(SELECT_CLASS);
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    updateLayoutOverlay(el);
    post({ type: "VE_SELECT", node: toSelectedNode(el), multi: false });
  }
  function getLabel(el) {
    return el.tagName.toLowerCase();
  }
  function buildTree(el) {
    if (SKIP_TAGS.has(el.tagName) || el.getAttribute("data-ve-ignore") === "true") return null;
    let id = el.getAttribute("data-ve-id");
    if (!id) {
      const tag = el.tagName.toLowerCase();
      id = `ve-${tag}-${Math.random().toString(36).slice(2, 9)}`;
      el.setAttribute("data-ve-id", id);
    }
    const children = [];
    Array.from(el.children).forEach((c) => {
      const n = buildTree(c);
      if (n) children.push(n);
    });
    return { id, tag: el.tagName.toLowerCase(), label: getLabel(el), children };
  }
  var STYLE_KEYS = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "zIndex",
    "flexDirection",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "alignSelf",
    "flex",
    "flexGrow",
    "flexShrink",
    "gap",
    "gridTemplateColumns",
    "gridTemplateRows",
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "margin",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "color",
    "backgroundColor",
    "backgroundImage",
    "border",
    "borderWidth",
    "borderStyle",
    "borderColor",
    "borderRadius",
    "boxShadow",
    "opacity",
    "overflow",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textDecoration",
    "transform",
    "transition",
    "cursor"
  ];
  var DIMENSIONAL_STYLE_KEYS = /* @__PURE__ */ new Set([
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight"
  ]);
  function getComputedStyleMap(el) {
    const html = el;
    const id = el.getAttribute("data-ve-id");
    const overrides = id && styleOverrides.get(id) || {};
    const out = {};
    STYLE_KEYS.forEach((k) => {
      if (overrides[k]) {
        out[k] = overrides[k];
        return;
      }
      const inline = html.style.getPropertyValue(toStylePropName(k));
      if (inline) {
        out[k] = inline;
        return;
      }
      if (DIMENSIONAL_STYLE_KEYS.has(k)) return;
      const cs = window.getComputedStyle(el);
      const v = cs[k];
      if (typeof v === "string" && v) out[k] = v;
    });
    return out;
  }
  function parsePropsSchema(el) {
    const raw = el.getAttribute("data-ve-props");
    if (!raw) return void 0;
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  function readPropValue(el, field) {
    const attr = el.getAttribute(`data-ve-prop-${field.name}`);
    if (attr === null) return field.value;
    if (field.type === "boolean") return attr === "true" || attr === "";
    if (field.type === "number") {
      const n = Number(attr);
      return Number.isFinite(n) ? n : field.value;
    }
    return attr;
  }
  function readPropsSchema(el) {
    const schema = parsePropsSchema(el);
    if (!schema) return void 0;
    return schema.map((p) => ({ ...p, value: readPropValue(el, p) }));
  }
  function applyPropSideEffect(el, name, value) {
    const tag = el.tagName;
    if (name === "disabled" && (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")) {
      if (value) el.setAttribute("disabled", "disabled");
      else el.removeAttribute("disabled");
      return;
    }
    if (name === "variant" && tag === "BUTTON") {
      const v = String(value);
      el.className = el.className.split(/\s+/).filter((c) => c && !c.startsWith("demo-btn--")).join(" ");
      if (!el.classList.contains("demo-btn")) el.classList.add("demo-btn");
      el.classList.add(`demo-btn--${v}`);
      return;
    }
    if (typeof value === "boolean") {
      if (value) el.setAttribute(name, "");
      else el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(value));
    }
  }
  function applyPropsToElement(nodeId, props) {
    const el = findById(nodeId);
    if (!el) return;
    Object.entries(props).forEach(([k, v]) => {
      el.setAttribute(`data-ve-prop-${k}`, String(v));
      applyPropSideEffect(el, k, v);
    });
    if (selectedId === nodeId) {
      clearHighlightClasses();
      el.classList.add(SELECT_CLASS);
      post({ type: "VE_SELECT", node: toSelectedNode(el), multi: false });
    }
    broadcastTree();
  }
  function getCssSelector(el) {
    const skip = /* @__PURE__ */ new Set([HOVER_CLASS, SELECT_CLASS, DRAGGING_CLASS, DROP_TARGET_CLASS, DROP_BEFORE_CLASS, DROP_AFTER_CLASS, TEXT_EDIT_CLASS]);
    const classes = Array.from(el.classList).filter((c) => !c.startsWith("ve-") && !skip.has(c));
    if (classes.length > 0) {
      return classes.map((c) => `.${c.replace(/:/g, "\\:")}`).join("");
    }
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const pClasses = Array.from(parent.classList).filter((c) => c.startsWith("demo-") || c.startsWith("app-"));
      if (pClasses.length > 0) {
        return `.${pClasses[0]} ${el.tagName.toLowerCase()}`;
      }
      parent = parent.parentElement;
    }
    return el.tagName.toLowerCase();
  }
  function parseSource(el) {
    const raw = el.getAttribute("data-ve-source");
    if (!raw) return void 0;
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  function isTextEditable(el) {
    const tag = el.tagName;
    if (NON_TEXT_EDIT_TAGS.has(tag)) return false;
    const elementChildren = Array.from(el.children);
    if (elementChildren.length === 0) {
      return TEXT_CONTAINER_TAGS.has(tag) || (el.textContent ?? "").trim().length > 0;
    }
    return elementChildren.every(
      (c) => c.tagName === "BR" || INLINE_PHRASING_TAGS.has(c.tagName)
    );
  }
  function eventTargetElement(e) {
    const raw = e.target;
    if (!raw) return null;
    const node = raw.nodeType === Node.TEXT_NODE ? raw.parentElement : raw;
    return node?.closest("[data-ve-id]") ?? null;
  }
  function unlockContentEditableTree(el) {
    el.removeAttribute("contenteditable");
    el.querySelectorAll("[contenteditable]").forEach((node) => {
      if (el.contains(node)) node.removeAttribute("contenteditable");
    });
  }
  function isWhitespaceOnly(text) {
    return text.length > 0 && /^\s*$/.test(text);
  }
  function collectEditableSegments(el) {
    const segs = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        segs.push({ kind: "text", value: node.textContent ?? "" });
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const child = node;
      if (child.tagName === "BR") {
        segs.push({ kind: "text", value: "\n" });
      } else if (INLINE_PHRASING_TAGS.has(child.tagName)) {
        segs.push({ kind: "inline", value: getEditableText(child) });
      } else {
        segs.push({ kind: "text", value: child.textContent ?? "" });
      }
    }
    return segs;
  }
  function getEditableText(el) {
    const segs = collectEditableSegments(el);
    if (segs.length === 0) {
      return (el.textContent ?? "").replace(/^[\t\n\r ]+/, "").replace(/[\t\n\r ]+$/, "");
    }
    let start = 0;
    while (start < segs.length && segs[start].kind === "text" && isWhitespaceOnly(segs[start].value)) {
      start++;
    }
    let end = segs.length - 1;
    while (end >= start && segs[end].kind === "text" && isWhitespaceOnly(segs[end].value)) {
      end--;
    }
    const out = [];
    for (let i = start; i <= end; i++) {
      const seg = segs[i];
      if (seg.kind === "inline") {
        out.push(seg.value);
        continue;
      }
      let t = seg.value;
      if (isWhitespaceOnly(t)) {
        const prevInline = i > start && segs[i - 1].kind === "inline";
        const nextInline = i < end && segs[i + 1].kind === "inline";
        if (prevInline && nextInline) {
          if (t.includes(" ")) out.push(" ");
          continue;
        }
      }
      if (i === start) t = t.replace(/^[\t\n\r ]+/, "");
      if (i === end) t = t.replace(/[\t\n\r ]+$/, "");
      out.push(t);
    }
    return out.join("");
  }
  function setElementText(el, text) {
    const kids = Array.from(el.children).filter((c) => c.tagName !== "BR");
    if (kids.length === 0) {
      el.textContent = text;
      return;
    }
    if (kids.length === 1 && kids[0].tagName === "SPAN") {
      const span = kids[0];
      const oldFull = getEditableText(el);
      const oldSpan = getEditableText(span);
      const idx = oldFull.indexOf(oldSpan);
      const before = idx > 0 ? oldFull.slice(0, idx) : "";
      const after = idx >= 0 ? oldFull.slice(idx + oldSpan.length) : "";
      let middle = text;
      if (before && text.startsWith(before)) {
        middle = text.slice(before.length);
        if (after && middle.endsWith(after)) middle = middle.slice(0, middle.length - after.length);
      }
      el.textContent = "";
      if (before) el.appendChild(document.createTextNode(before));
      span.textContent = middle;
      el.appendChild(span);
      if (after) el.appendChild(document.createTextNode(after));
      return;
    }
    el.textContent = text;
  }
  function resolveMediaKind(el) {
    const tag = el.tagName;
    if (tag === "IMG") return "image";
    if (tag === "AUDIO") return "audio";
    if (tag === "VIDEO") return "video";
    if (tag === "SOURCE") {
      const parent = el.parentElement?.tagName;
      if (parent === "AUDIO") return "audio";
      if (parent === "VIDEO") return "video";
    }
    return void 0;
  }
  function readMediaSrc(el) {
    const direct = el.getAttribute("src") ?? "";
    if (direct) return direct;
    const source = el.querySelector("source");
    return source?.getAttribute("src") ?? "";
  }
  function readMediaFields(el, kind) {
    const fields = [];
    if (kind === "image" && el.tagName === "IMG") {
      fields.push({ name: "src", label: "\u56FE\u7247\u5730\u5740", value: el.getAttribute("src") ?? "" });
      fields.push({ name: "alt", label: "\u66FF\u4EE3\u6587\u672C", value: el.getAttribute("alt") ?? "" });
      return fields;
    }
    if (kind === "audio") {
      fields.push({ name: "src", label: "\u97F3\u9891\u5730\u5740", value: readMediaSrc(el) });
      return fields;
    }
    if (kind === "video") {
      fields.push({ name: "src", label: "\u89C6\u9891\u5730\u5740", value: readMediaSrc(el) });
      if (el.tagName === "VIDEO" && el.hasAttribute("poster")) {
        fields.push({ name: "poster", label: "\u5C01\u9762\u56FE", value: el.getAttribute("poster") ?? "" });
      }
      return fields;
    }
    return fields;
  }
  function recordUrlReplacement(oldUrl, newUrl) {
    if (!oldUrl || !newUrl || oldUrl === newUrl) return;
    urlReplacements.forEach((v, k) => {
      if (v === oldUrl) urlReplacements.set(k, newUrl);
    });
    urlReplacements.set(oldUrl, newUrl);
  }
  function readMediaAttrBefore(el, name) {
    if (name === "poster") return el.getAttribute("poster") ?? "";
    if (name === "alt") return el.getAttribute("alt") ?? "";
    return readMediaSrc(el);
  }
  function setMediaAttribute(el, name, value) {
    const trimmed = value.trim();
    const oldUrl = name === "src" || name === "poster" ? readMediaAttrBefore(el, name) : "";
    if (!trimmed) {
      el.removeAttribute(name);
      if (name === "src") {
        if (el.tagName === "IMG") el.removeAttribute("src");
        if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
          el.querySelectorAll("source").forEach((s) => s.removeAttribute("src"));
        }
      }
      return;
    }
    if (oldUrl && (name === "src" || name === "poster")) {
      recordUrlReplacement(oldUrl, trimmed);
    }
    el.setAttribute(name, trimmed);
    if (name === "src") {
      if (el.tagName === "IMG") {
        el.src = trimmed;
        return;
      }
      if (el.tagName === "SOURCE") return;
      if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
        let source = el.querySelector("source");
        if (!source) {
          source = document.createElement("source");
          el.appendChild(source);
        }
        source.setAttribute("src", trimmed);
      }
    }
  }
  function applyMediaToElement(nodeId, attrs) {
    const el = findById(nodeId);
    if (!el || !resolveMediaKind(el)) return;
    Object.entries(attrs).forEach(([name, value]) => setMediaAttribute(el, name, value));
    if (selectedId === nodeId) {
      clearHighlightClasses();
      el.classList.add(SELECT_CLASS);
      post({ type: "VE_SELECT", node: toSelectedNode(el), multi: false });
    }
    broadcastTree();
  }
  function toSelectedNode(el) {
    const id = el.getAttribute("data-ve-id");
    const editable = isTextEditable(el);
    const mediaKind = resolveMediaKind(el);
    const htmlEl = el;
    return {
      id,
      tag: el.tagName.toLowerCase(),
      path: getPath(el),
      componentName: el.getAttribute("data-ve-component") ?? void 0,
      source: parseSource(el),
      cssSelector: getCssSelector(el),
      styles: getComputedStyleMap(el),
      propsSchema: readPropsSchema(el),
      textContent: editable ? getEditableText(el) : void 0,
      textEditable: editable,
      mediaKind,
      mediaFields: mediaKind ? readMediaFields(htmlEl, mediaKind) : void 0
    };
  }
  function findById(id) {
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
  function syncStructureDraggable(on) {
    document.querySelectorAll("[data-ve-id]").forEach((el) => {
      el.draggable = on;
    });
  }
  function injectStyles() {
    if (document.getElementById("ve-runtime-styles")) return;
    const s = document.createElement("style");
    s.id = "ve-runtime-styles";
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
  function finishTextEdit(commit) {
    if (!editingEl) return;
    const el = editingEl;
    const id = el.getAttribute("data-ve-id");
    if (commit && id) {
      const newText = getEditableText(el);
      if (newText !== editingOriginalText) {
        post({
          type: "VE_TEXT_CHANGED",
          nodeId: id,
          text: newText,
          previousText: editingOriginalText
        });
        broadcastTree();
      }
    } else {
      setElementText(el, editingOriginalText);
    }
    unlockContentEditableTree(el);
    el.classList.remove(TEXT_EDIT_CLASS);
    if (editingBlurHandler) {
      el.removeEventListener("blur", editingBlurHandler);
      editingBlurHandler = null;
    }
    editingEl = null;
    editingOriginalText = "";
  }
  function startTextEdit(el) {
    if (!isTextEditable(el)) return;
    if (editingEl === el) return;
    if (editingEl) finishTextEdit(true);
    editingEl = el;
    editingOriginalText = getEditableText(el);
    unlockContentEditableTree(el);
    el.contentEditable = "true";
    el.classList.add(TEXT_EDIT_CLASS);
    editingBlurHandler = () => finishTextEdit(true);
    el.addEventListener("blur", editingBlurHandler);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  function applyTextToElement(nodeId, text) {
    const el = findById(nodeId);
    if (!el || !isTextEditable(el)) return;
    if (editingEl === el) {
      editingOriginalText = text;
    }
    setElementText(el, text);
    if (editingEl !== el) broadcastTree();
  }
  function toStylePropName(key) {
    return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  }
  function resolveStyleValueForDom(value, el) {
    const trimmed = value.trim();
    const varMatch = trimmed.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (!varMatch) return trimmed;
    const fromEl = getComputedStyle(el).getPropertyValue(varMatch[1]).trim();
    if (fromEl) return fromEl;
    const fromRoot = getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim();
    return fromRoot || trimmed;
  }
  function applyStylesToElement(nodeId, styles, replace = false) {
    const el = findById(nodeId);
    if (!el) return;
    const htmlEl = el;
    const prev = styleOverrides.get(nodeId) ?? {};
    const next = replace ? { ...styles } : { ...prev, ...styles };
    styleOverrides.set(nodeId, next);
    if (replace) {
      htmlEl.removeAttribute("style");
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
      post({ type: "VE_SELECT", node: toSelectedNode(el), multi: false });
    }
  }
  function restoreSnapshots(snapshots) {
    const touchedStyles = /* @__PURE__ */ new Set([...styleOverrides.keys()]);
    snapshots.forEach((s) => {
      if (Object.keys(s.styles).length > 0) touchedStyles.add(s.nodeId);
    });
    styleOverrides.clear();
    touchedStyles.forEach((id) => {
      const el = findById(id);
      if (el) el.removeAttribute("style");
    });
    snapshots.forEach(({ nodeId, styles, textContent, mediaAttrs }) => {
      if (textContent !== void 0) {
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
        el.classList.add(SELECT_CLASS);
        post({ type: "VE_SELECT", node: toSelectedNode(el), multi: false });
      }
    }
  }
  function reorderNode(nodeId, targetId, position) {
    const node = findById(nodeId);
    const target = findById(targetId);
    if (!node || !target || node === target) return;
    const parent = target.parentElement;
    if (!parent || node.parentElement !== parent) return;
    if (position === "before") {
      parent.insertBefore(node, target);
    } else {
      parent.insertBefore(node, target.nextSibling);
    }
    const parentId = parent.getAttribute("data-ve-id") ?? "body";
    const childIds = Array.from(parent.children).map((c) => c.getAttribute("data-ve-id")).filter(Boolean);
    post({ type: "VE_REORDERED", nodeId, parentId, childIds });
    broadcastTree();
  }
  var VE_ATTR_PREFIX = "data-ve-";
  function syncStyleOverridesBeforeExport() {
    styleOverrides.forEach((styles, nodeId) => {
      applyStylesToElement(nodeId, styles, true);
    });
  }
  function materializeCssVariablesOnTree(root) {
    root.querySelectorAll("[style]").forEach((node) => {
      const el = node;
      const style = el.style;
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        const val = style.getPropertyValue(prop);
        if (!val.includes("var(")) continue;
        const resolved = resolveStyleValueForDom(val, el);
        if (resolved && resolved !== val) {
          style.setProperty(prop, resolved);
        }
      }
    });
  }
  function cleanExportClone(root) {
    const removeSelectors = [
      "#ve-runtime-styles",
      "#ve-layout-overlay",
      'script[data-ve-ignore="true"]',
      'script[src*="ve-runtime"]'
    ];
    removeSelectors.forEach((sel) => {
      root.querySelectorAll(sel).forEach((el) => el.remove());
    });
    root.querySelectorAll("script").forEach((script) => {
      const text = script.textContent ?? "";
      if (text.includes("visual-editor") || text.includes(VE_CHANNEL) || text.includes("ve-runtime.js")) {
        script.remove();
      }
    });
    root.querySelectorAll("*").forEach((node) => {
      const el = node;
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
      if (el.isContentEditable) el.contentEditable = "false";
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name === "data-ve-mode") {
          el.removeAttribute(attr.name);
          return;
        }
        if (attr.name.startsWith("data-ve-prop-")) {
          const prop = attr.name.slice("data-ve-prop-".length);
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
  function applyUrlReplacementsToHtml(html) {
    let out = html;
    urlReplacements.forEach((newUrl, oldUrl) => {
      if (oldUrl && newUrl && oldUrl !== newUrl) {
        out = out.split(oldUrl).join(newUrl);
      }
    });
    return out;
  }
  function syncMediaAttributesBeforeExport(root) {
    root.querySelectorAll("img[src], video[src], audio[src]").forEach((node) => {
      const el = node;
      const attr = el.getAttribute("src");
      if (attr) el.src = attr;
    });
    root.querySelectorAll("video[poster]").forEach((node) => {
      const el = node;
      const poster = el.getAttribute("poster");
      if (poster) el.poster = poster;
    });
  }
  function exportDocumentHtml() {
    syncStyleOverridesBeforeExport();
    syncMediaAttributesBeforeExport(document.documentElement);
    materializeCssVariablesOnTree(document.documentElement);
    const clone = document.documentElement.cloneNode(true);
    cleanExportClone(clone);
    syncMediaAttributesBeforeExport(clone);
    const base = clone.querySelector("base");
    if (base) {
      const href = base.getAttribute("href") ?? "";
      if (href.startsWith("http://localhost") || href.startsWith("http://127.0.0.1") || href === "about:blank") {
        base.remove();
      }
    }
    const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ""}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ""}>` : "<!DOCTYPE html>";
    return applyUrlReplacementsToHtml(`${doctype}
${clone.outerHTML}`);
  }
  function shouldApplyShellTheme() {
    const root = document.documentElement;
    if (root.hasAttribute("data-ve-ignore-shell-theme")) return false;
    if (root.hasAttribute("data-ve-allow-shell-theme")) return true;
    return true;
  }
  function setTheme(theme) {
    if (!shouldApplyShellTheme()) return;
    const root = document.documentElement;
    let next = root.getAttribute("data-theme") === "light" ? "light" : "dark";
    if (theme === "toggle") {
      next = next === "light" ? "dark" : "light";
    } else {
      next = theme;
    }
    root.setAttribute("data-theme", next);
    post({ type: "VE_THEME", theme: next });
  }
  function hookConsole() {
    const levels = ["log", "warn", "error", "info"];
    levels.forEach((level) => {
      const orig = console[level].bind(console);
      console[level] = (...args) => {
        orig(...args);
        const entry = {
          id: `c_${Date.now()}`,
          level: level === "info" ? "log" : level,
          message: args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "),
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        post({ type: "VE_CONSOLE", entry });
      };
    });
  }
  function handleClick(e) {
    if (window.parent === window || editorMode === "structure") return;
    if (editingEl && !editingEl.contains(e.target)) {
      finishTextEdit(true);
    }
    const target = eventTargetElement(e);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    selectedId = target.getAttribute("data-ve-id");
    clearHighlightClasses();
    target.classList.add(SELECT_CLASS);
    updateLayoutOverlay(target);
    post({ type: "VE_SELECT", node: toSelectedNode(target), multi: e.ctrlKey || e.metaKey });
  }
  function handleDblClick(e) {
    if (window.parent === window || editorMode === "structure") return;
    const target = eventTargetElement(e);
    if (!target || !isTextEditable(target)) return;
    e.preventDefault();
    e.stopPropagation();
    selectedId = target.getAttribute("data-ve-id");
    clearHighlightClasses();
    target.classList.add(SELECT_CLASS);
    updateLayoutOverlay(target);
    post({ type: "VE_SELECT", node: toSelectedNode(target), multi: false });
    startTextEdit(target);
  }
  function handleTextEditKeydown(e) {
    if (!editingEl) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finishTextEdit(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      const tag = editingEl.tagName;
      if (!["P", "DIV", "TEXTAREA", "LI"].includes(tag)) {
        e.preventDefault();
        e.stopPropagation();
        finishTextEdit(true);
      }
    }
  }
  function handleMouseOver(e) {
    if (window.parent === window || editingEl) return;
    const target = e.target.closest("[data-ve-id]");
    const id = target?.getAttribute("data-ve-id");
    if (!id || id === selectedId) return;
    if (editorMode !== "structure") {
      document.querySelectorAll(`.${HOVER_CLASS}`).forEach((el) => {
        if (!el.classList.contains(SELECT_CLASS)) el.classList.remove(HOVER_CLASS);
      });
      target?.classList.add(HOVER_CLASS);
    }
    post({ type: "VE_HOVER", nodeId: id });
  }
  function resolveDragSource(start) {
    if (!start) return null;
    let target = start.closest("[data-ve-id]");
    if (!target) return null;
    if (selectedId) {
      const selected = findById(selectedId);
      if (selected?.contains(target)) return selected;
    }
    return target;
  }
  function handleDragStart(e) {
    if (editorMode !== "structure") return;
    const target = resolveDragSource(e.target);
    if (!target) return;
    dragSourceId = target.getAttribute("data-ve-id");
    target.classList.add(DRAGGING_CLASS);
    e.dataTransfer?.setData("text/ve-id", dragSourceId ?? "");
    e.dataTransfer.effectAllowed = "move";
  }
  function clearDropIndicators() {
    document.querySelectorAll(`.${DROP_TARGET_CLASS}, .${DROP_BEFORE_CLASS}, .${DROP_AFTER_CLASS}`).forEach((el) => {
      el.classList.remove(DROP_TARGET_CLASS, DROP_BEFORE_CLASS, DROP_AFTER_CLASS);
    });
  }
  function toastWarn(message) {
    post({
      type: "VE_CONSOLE",
      entry: {
        id: `toast_${Date.now()}`,
        level: "warn",
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  function handleDragOver(e) {
    if (editorMode !== "structure" || !dragSourceId) return;
    const target = e.target.closest("[data-ve-id]");
    if (!target || target.getAttribute("data-ve-id") === dragSourceId) return;
    const src = findById(dragSourceId);
    if (!src?.parentElement || src.parentElement !== target.parentElement) {
      e.dataTransfer.dropEffect = "none";
      clearDropIndicators();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropIndicators();
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    target.classList.add(DROP_TARGET_CLASS);
    target.classList.add(before ? DROP_BEFORE_CLASS : DROP_AFTER_CLASS);
  }
  function handleDrop(e) {
    if (editorMode !== "structure" || !dragSourceId) return;
    e.preventDefault();
    const target = e.target.closest("[data-ve-id]");
    document.querySelectorAll(`.${DRAGGING_CLASS}`).forEach((el) => el.classList.remove(DRAGGING_CLASS));
    clearDropIndicators();
    if (!target) {
      dragSourceId = null;
      return;
    }
    const src = findById(dragSourceId);
    if (!src?.parentElement || src.parentElement !== target.parentElement) {
      toastWarn("\u53EA\u80FD\u5728\u540C\u4E00\u5BB9\u5668\u5185\u8C03\u6574\u540C\u7EA7\u5143\u7D20\u987A\u5E8F");
      dragSourceId = null;
      return;
    }
    const targetId = target.getAttribute("data-ve-id");
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    reorderNode(dragSourceId, targetId, before ? "before" : "after");
    dragSourceId = null;
  }
  function handleDragEnd() {
    dragSourceId = null;
    document.querySelectorAll(`.${DRAGGING_CLASS}`).forEach((el) => el.classList.remove(DRAGGING_CLASS));
    clearDropIndicators();
  }
  function onMessage(event) {
    const data = event.data;
    if (!data || data.channel !== VE_CHANNEL) return;
    if (!acceptVePostMessageOrigin(event.origin, window.location.origin)) return;
    const msg = data;
    switch (msg.type) {
      case "VE_INIT":
        if (!booted && window.parent !== window) {
          initVisualEditorRuntime();
        }
        ensureIds();
        if (booted) {
          sendReadyTree();
          scheduleTreeSync();
        }
        break;
      case "VE_SET_MODE":
        editorMode = msg.mode;
        document.documentElement.setAttribute("data-ve-mode", msg.mode);
        syncStructureDraggable(msg.mode === "structure");
        break;
      case "VE_HIGHLIGHT": {
        clearHighlightClasses();
        if (msg.nodeId) {
          const el = findById(msg.nodeId);
          if (el) {
            el.classList.add(SELECT_CLASS);
            selectedId = msg.nodeId;
            updateLayoutOverlay(el);
          }
        } else {
          selectedId = null;
          removeLayoutOverlay();
        }
        break;
      }
      case "VE_APPLY_STYLE":
        applyStylesToElement(msg.nodeId, msg.styles);
        break;
      case "VE_APPLY_PROPS":
        applyPropsToElement(msg.nodeId, msg.props);
        break;
      case "VE_RESTORE":
        restoreSnapshots(msg.snapshots);
        break;
      case "VE_REORDER":
        reorderNode(msg.nodeId, msg.targetId, msg.position);
        break;
      case "VE_SET_THEME":
        setTheme(msg.theme);
        break;
      case "VE_EXPORT_HTML":
        post({ type: "VE_HTML_EXPORT", html: exportDocumentHtml() });
        break;
      case "VE_START_TEXT_EDIT": {
        const el = findById(msg.nodeId);
        if (el) startTextEdit(el);
        break;
      }
      case "VE_APPLY_TEXT":
        applyTextToElement(msg.nodeId, msg.text);
        break;
      case "VE_APPLY_MEDIA":
        applyMediaToElement(msg.nodeId, msg.attrs);
        break;
      case "VE_SELECT_NODE":
        selectElementById(msg.nodeId);
        break;
    }
  }
  function initVisualEditorRuntime() {
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
        const el = findById(selectedId);
        if (el) updateLayoutOverlay(el);
      };
      window.addEventListener("scroll", syncOverlayOnScroll, true);
      window.addEventListener("resize", syncOverlayOnScroll);
      document.addEventListener("click", handleClick, true);
      document.addEventListener("dblclick", handleDblClick, true);
      document.addEventListener("keydown", handleTextEditKeydown, true);
      document.addEventListener("mouseover", handleMouseOver, true);
      document.addEventListener("dragstart", handleDragStart);
      document.addEventListener("dragover", handleDragOver);
      document.addEventListener("drop", handleDrop);
      document.addEventListener("dragend", handleDragEnd);
      syncStructureDraggable(editorMode === "structure");
      window.addEventListener("message", onMessage);
      sendReadyTree();
      startTreeObserver();
      post({ type: "VE_RUNTIME_LOADED" });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
  initVisualEditorRuntime();
})();
