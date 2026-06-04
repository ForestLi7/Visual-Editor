import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TOKEN_CONFIG = resolve(REPO_ROOT, '.visualeditorrc.json');

function loadDesignTokens(): Record<string, string> {
  try {
    if (!existsSync(TOKEN_CONFIG)) return {};
    const raw = JSON.parse(readFileSync(TOKEN_CONFIG, 'utf-8')) as { tokens?: Record<string, string> };
    return raw.tokens ?? {};
  } catch {
    return {};
  }
}

function buildTokenStyleBlock(tokens: Record<string, string>): string {
  const entries = Object.entries(tokens);
  if (entries.length === 0) return '';
  const vars = entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  return `<style id="ve-design-tokens" data-ve-ignore="true">:root, html { ${vars} }</style>`;
}

function buildExternalRuntimeSnippet(editorOrigin: string): string {
  const safeOrigin = editorOrigin.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = [
    '<!-- visual-editor inspector -->',
    '<script>',
    '(function(){',
    "  var ch = 'visual-editor';",
    '  function notify(type, detail) {',
    '    try {',
    '      if (window.parent !== window) {',
    "        window.parent.postMessage({ channel: ch, type: type, detail: detail }, '*');",
    '      }',
    '    } catch (e) {}',
    '  }',
    `  var src = '${safeOrigin}/ve-runtime.js';`,
    "  var s = document.createElement('script');",
    '  s.src = src;',
    '  s.async = false;',
    "  s.onload = function () { notify('VE_RUNTIME_LOADED'); };",
    "  s.onerror = function () { notify('VE_RUNTIME_ERROR', 'failed to load ' + src); };",
    '  (document.body || document.documentElement).appendChild(s);',
    '})();',
    '</script>',
  ];
  return lines.join('\n');
}

/** 将片段/不完整 HTML 规范为可解析的完整文档 */
export function normalizeImportHtml(html: string): string {
  let doc = html.trim();
  doc = doc.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  if (!/<!DOCTYPE/i.test(doc)) {
    doc = `<!DOCTYPE html>\n${doc}`;
  }
  if (!/<html[\s>]/i.test(doc)) {
    doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${doc}</body></html>`;
    return doc;
  }
  if (!/<head[\s>]/i.test(doc)) {
    doc = doc.replace(/<html([^>]*)>/i, '<html$1><head><meta charset="UTF-8"></head>');
  }
  if (!/<body[\s>]/i.test(doc)) {
    if (/<\/head>/i.test(doc)) {
      doc = doc.replace(/<\/head>/i, '</head><body>');
      doc = doc.replace(/<\/html>/i, '</body></html>');
    } else if (/<html[\s>]/i.test(doc)) {
      doc = doc.replace(/<html([^>]*)>/i, '<html$1><body>');
      doc = doc.replace(/<\/html>/i, '</body></html>');
    } else {
      doc = doc.replace(/<\/html>/i, '<body></body></html>');
    }
  }
  return doc;
}

function escapeInlineScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

function buildInjectSnippet(inlineRuntimeJs?: string, editorOrigin?: string): string {
  if (inlineRuntimeJs) {
    return `
<!-- visual-editor inspector (inline) -->
<script data-ve-ignore="true">
${escapeInlineScript(inlineRuntimeJs)}
</script>`;
  }
  const origin = editorOrigin?.replace(/\/$/, '') || '';
  if (!origin) {
    throw new Error('editorOrigin required when runtime is not inlined');
  }
  return buildExternalRuntimeSnippet(origin);
}

/** 导入页默认不跟随 Shell 主题按钮改 data-theme，避免覆盖页面自有配色 */
export function markImportedPageShellThemePolicy(html: string): string {
  if (/<html[^>]*\sdata-ve-allow-shell-theme/i.test(html)) {
    return html;
  }
  return html.replace(/<html([^>]*)>/i, (full, attrs: string) => {
    if (/\sdata-ve-ignore-shell-theme/i.test(attrs)) return full;
    return `<html${attrs} data-ve-ignore-shell-theme="true">`;
  });
}

export function injectRuntime(
  html: string,
  baseHref: string,
  inlineRuntimeJs?: string,
  editorOrigin?: string
): string {
  const normalized = markImportedPageShellThemePolicy(normalizeImportHtml(html));
  const baseTag = `<base href="${baseHref}" />`;
  const tokenStyle = buildTokenStyleBlock(loadDesignTokens());
  const snippet = buildInjectSnippet(inlineRuntimeJs, editorOrigin);

  let out = normalized;
  if (!/<base\s/i.test(out)) {
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${tokenStyle}`);
    } else {
      out = `<head>${baseTag}${tokenStyle}</head>${out}`;
    }
  } else if (tokenStyle && /<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${tokenStyle}`);
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${snippet}</body>`);
  } else {
    out = out + snippet;
  }
  return out;
}
