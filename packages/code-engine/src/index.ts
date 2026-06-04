import type { SemanticChange } from '@ve/core';

export type { DiffDisplayLine, DiffLineKind } from './unifiedDiff.js';
export { buildUnifiedDiffLines } from './unifiedDiff.js';
export type {
  SideBySideRow,
  SideBySideCell,
  SideCellKind,
  TextSpan,
  ChangeBlockIndex,
} from './sideBySideDiff.js';
export {
  buildSideBySideDiff,
  buildSideBySideFromUnified,
  findChangeBlocks,
  getChangeRowIndices,
  inlineDiffSpans,
  isChangeRow,
} from './sideBySideDiff.js';
export { buildPreviewDiffs } from './previewDiff.js';
export { buildImportPageDiffs, importPageFilePath } from './importPageDiff.js';
export type { FileHunk, VisualEditorConfig } from './types.js';

export interface ApplyResult {
  ok: boolean;
  applied: string[];
  errors: string[];
}

import type { FileHunk, VisualEditorConfig } from './types.js';

/** 将变更集转为可展示的 diff hunks */
export function generateHunks(
  changes: SemanticChange[],
  config: VisualEditorConfig
): FileHunk[] {
  const byFile = new Map<string, FileHunk>();

  for (const ch of changes) {
    const file =
      ch.target.source?.file ??
      config.fileMap[config.projectId] ??
      'demo-app/src/App.tsx';

    const styleKey = String(ch.payload.property ?? 'style');
    const value = String(ch.payload.value ?? '');
    const prop = String(ch.payload.cssProperty ?? styleKey);

    let hunk = byFile.get(file);
    if (!hunk) {
      hunk = {
        id: `hunk_${file}`,
        file,
        description: `样式/属性更新`,
        oldLines: [],
        newLines: [],
        selected: true,
      };
      byFile.set(file, hunk);
    }

    if (ch.kind === 'reorder') {
      hunk.description = `重排子节点顺序`;
      hunk.oldLines.push(`  /* 原顺序 */`);
      hunk.newLines.push(`  /* ${(ch.payload.childIds as string[])?.join(' → ') ?? ''} */`);
      continue;
    }

    if (ch.kind === 'text') {
      const prev = String(ch.payload.previousText ?? '');
      const next = String(ch.payload.text ?? '');
      const loc = ch.target.path ? ` · ${ch.target.path}` : '';
      hunk.description = `${ch.target.tag ?? 'element'}${loc} — 文本`;
      hunk.oldLines.push(prev || '(空)');
      hunk.newLines.push(next || '(空)');
      continue;
    }

    if (ch.kind === 'media') {
      const attr = String(ch.payload.attr ?? 'attr');
      const prev = String(ch.payload.previousValue ?? '');
      const next = String(ch.payload.value ?? '');
      hunk.description = `${ch.target.tag ?? 'media'} — ${attr}`;
      hunk.oldLines.push(`${attr}="${prev}"`);
      hunk.newLines.push(`${attr}="${next}"`);
      continue;
    }

    if (ch.kind === 'prop') {
      const p = String(ch.payload.prop ?? 'prop');
      hunk.description = `${ch.target.componentName ?? ch.target.tag ?? 'element'} — ${p}`;
      hunk.oldLines.push(`${p}={/* 原值 */}`);
      hunk.newLines.push(`${p}={${JSON.stringify(ch.payload.value)}}`);
      continue;
    }

    {
      const prev = String(ch.payload.previousValue ?? '/* 原值 */');
      hunk.oldLines.push(`  ${prop}: ${JSON.stringify(prev)};`);
      hunk.newLines.push(`  ${prop}: ${JSON.stringify(value)};`);
      hunk.description = `${ch.target.componentName ?? ch.target.tag ?? 'element'} — ${prop}`;
    }
  }

  return Array.from(byFile.values());
}

/** 按 data-ve-id 块重排 TSX 中同级节点 */
export function applyReorderToSource(content: string, change: SemanticChange): string {
  const childIds = change.payload.childIds as string[] | undefined;
  if (!childIds?.length) return content;

  const blocks: { id: string; text: string; index: number }[] = [];
  for (const id of childIds) {
    const re = new RegExp(
      `(<[a-zA-Z][^>]*data-ve-id="${id}"[\\s\\S]*?<\\/[a-zA-Z]+>)`,
      'm'
    );
    const m = content.match(re);
    if (m?.[1]) blocks.push({ id, text: m[1], index: m.index ?? 0 });
  }
  if (blocks.length < 2) return content;

  const sorted = [...blocks].sort((a, b) => a.index - b.index);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = first.index;
  const end = last.index + last.text.length;
  const region = content.slice(start, end);

  let rebuilt = region;
  sorted.forEach((b) => {
    rebuilt = rebuilt.replace(b.text, `__VE_PLACEHOLDER_${b.id}__`);
  });
  childIds.forEach((id) => {
    const b = blocks.find((x) => x.id === id);
    if (b) rebuilt = rebuilt.replace(`__VE_PLACEHOLDER_${id}__`, b.text);
  });

  return content.slice(0, start) + rebuilt + content.slice(end);
}

/** 将变更应用到文件内容（MVP：基于 style 对象块替换） */
export function applyChangesToSource(
  content: string,
  changes: SemanticChange[]
): string {
  let result = content;

  for (const ch of changes) {
    if (ch.kind === 'reorder') {
      result = applyReorderToSource(result, ch);
      continue;
    }
    if (ch.kind !== 'style' && ch.kind !== 'layout') continue;
    const cssProp = String(ch.payload.cssProperty ?? '');
    const value = String(ch.payload.value ?? '');
    if (!cssProp) continue;

    const camel = cssProp.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const patterns = [
      new RegExp(`(${camel}|${cssProp})\\s*:\\s*['"\`][^'"\`]*['"\`]`, 'g'),
      new RegExp(`(${camel}|${cssProp})\\s*:\\s*[^,}\\n]+`, 'g'),
    ];

    let replaced = false;
    for (const re of patterns) {
      if (re.test(result)) {
        result = result.replace(re, `${camel}: '${value.replace(/'/g, "\\'")}'`);
        replaced = true;
        break;
      }
    }

    if (!replaced && ch.target.componentName) {
      const comp = ch.target.componentName;
      const styleBlock = new RegExp(
        `(<${comp}[^>]*style=\\{\\{)([^}]*)(\\}\\})`,
        's'
      );
      if (styleBlock.test(result)) {
        result = result.replace(styleBlock, (_, a, mid, c) => {
          const insert = mid.trim().endsWith(',') || !mid.trim()
            ? `${mid} ${camel}: '${value}',`
            : `${mid}, ${camel}: '${value}',`;
          return `${a}${insert}${c}`;
        });
      }
    }
  }

  return result;
}

export { applyChangesToCss, applyPropertyInRule } from './applyCss.js';

export function applyHunksToFiles(
  files: { path: string; content: string }[],
  changes: SemanticChange[]
): { path: string; content: string }[] {
  return files.map((f) => ({
    path: f.path,
    content: applyChangesToSource(f.content, changes),
  }));
}
