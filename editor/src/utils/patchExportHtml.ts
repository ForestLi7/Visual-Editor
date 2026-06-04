import type { SemanticChange } from '@ve/core';

/** 将待应用变更同步到导出 HTML（媒体 URL、文本兜底） */
export function patchExportedHtmlWithPendingChanges(
  html: string,
  changes: SemanticChange[]
): string {
  let out = html;
  const sorted = [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const ch of sorted) {
    if (ch.kind === 'media') {
      const attr = String(ch.payload.attr ?? '');
      if (attr !== 'src' && attr !== 'poster') continue;
      const prev = String(ch.payload.previousValue ?? '');
      const next = String(ch.payload.value ?? '');
      if (prev && next && prev !== next) {
        out = out.split(prev).join(next);
      }
      continue;
    }

    if (ch.kind === 'text') {
      const prev = String(ch.payload.previousText ?? '');
      const next = String(ch.payload.text ?? '');
      if (prev && next && prev !== next && out.includes(prev)) {
        out = out.split(prev).join(next);
      }
    }
  }
  return out;
}

/** @deprecated 使用 patchExportedHtmlWithPendingChanges */
export function patchExportedHtmlWithMediaChanges(
  html: string,
  changes: SemanticChange[]
): string {
  return patchExportedHtmlWithPendingChanges(html, changes);
}
