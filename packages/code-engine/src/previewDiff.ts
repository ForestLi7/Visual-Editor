import type { SemanticChange } from '@ve/core';
import { buildUnifiedDiffLines, type DiffDisplayLine } from './unifiedDiff.js';
import { buildSideBySideFromUnified } from './sideBySideDiff.js';
import type { FileHunk, VisualEditorConfig } from './types.js';

export type ApplySourceFn = (content: string, changes: SemanticChange[]) => string;

function collectTargetFiles(
  changes: SemanticChange[],
  config: VisualEditorConfig
): Set<string> {
  const paths = new Set<string>();
  for (const ch of changes) {
    const file =
      ch.target.source?.file ??
      config.fileMap[config.projectId] ??
      'demo-app/src/App.tsx';
    paths.add(file);
  }
  if (changes.some((c) => c.kind === 'style' || c.kind === 'layout')) {
    paths.add('demo-app/src/App.css');
  }
  return paths;
}

export function semanticFallbackLines(changes: SemanticChange[], file: string): DiffDisplayLine[] {
  const lines: DiffDisplayLine[] = [];
  let oldLn = 1;
  let newLn = 1;

  for (const ch of changes) {
    const chFile =
      ch.target.source?.file ?? 'demo-app/src/App.tsx';
    if (chFile !== file && file !== 'demo-app/src/App.css') continue;
    if (file === 'demo-app/src/App.css' && ch.kind !== 'style' && ch.kind !== 'layout') continue;
    if (file !== 'demo-app/src/App.css' && ch.kind === 'style' && !ch.target.source?.file) {
      /* style may map to css */
    }

    if (ch.kind === 'reorder') {
      const ids = (ch.payload.childIds as string[])?.join(' → ') ?? '';
      lines.push({ type: 'del', content: `/* 原 DOM 子节点顺序 */`, oldLine: oldLn++ });
      lines.push({ type: 'add', content: `/* 新顺序: ${ids} */`, newLine: newLn++ });
      continue;
    }

    if (ch.kind === 'text') {
      const prev = String(ch.payload.previousText ?? '');
      const next = String(ch.payload.text ?? '');
      const loc = ch.target.path ? ` /* ${ch.target.path} */` : '';
      lines.push({ type: 'del', content: `${prev || '(空)'}${loc}`, oldLine: oldLn++ });
      lines.push({ type: 'add', content: `${next || '(空)'}${loc}`, newLine: newLn++ });
      continue;
    }

    if (ch.kind === 'prop') {
      const prop = String(ch.payload.prop ?? '');
      const val = JSON.stringify(ch.payload.value);
      lines.push({ type: 'add', content: `${prop}={${val}}`, newLine: newLn++ });
      continue;
    }

    const prop = String(ch.payload.cssProperty ?? ch.payload.property ?? 'style');
    const value = String(ch.payload.value ?? '');
    const prev = String(ch.payload.previousValue ?? '/* 原值 */');
    const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const isCss = file.endsWith('.css');
    const oldContent = isCss ? `  ${cssProp}: ${prev};` : `  ${prop}: ${JSON.stringify(prev)};`;
    const newContent = isCss ? `  ${cssProp}: ${value};` : `  ${prop}: ${JSON.stringify(value)};`;
    lines.push({ type: 'del', content: oldContent, oldLine: oldLn++ });
    lines.push({ type: 'add', content: newContent, newLine: newLn++ });
  }

  if (lines.length === 0) return lines;

  return [
    { type: 'hunk', content: '@@ 语义变更（未能匹配到源文件具体行，以下为摘要） @@' },
    ...lines,
  ];
}

export function countStats(lines: DiffDisplayLine[]) {
  let additions = 0;
  let deletions = 0;
  for (const l of lines) {
    if (l.type === 'add') additions++;
    if (l.type === 'del') deletions++;
  }
  return { additions, deletions };
}

/** 读取磁盘文件并生成带 unified diff 的 hunks */
export function buildPreviewDiffs(
  changes: SemanticChange[],
  config: VisualEditorConfig,
  readFile: (relPath: string) => string | null,
  applySource: ApplySourceFn,
  applyCss: ApplySourceFn
): FileHunk[] {
  const paths = collectTargetFiles(changes, config);
  const hunks: FileHunk[] = [];

  for (const file of paths) {
    const oldContent = readFile(file);
    if (oldContent === null) continue;

    const newContent = file.endsWith('.css')
      ? applyCss(oldContent, changes)
      : applySource(oldContent, changes);

    let diffLines: DiffDisplayLine[] = [];
    let sideBySideRows = buildSideBySideFromUnified([]);
    let additions = 0;
    let deletions = 0;

    if (oldContent !== newContent) {
      const built = buildUnifiedDiffLines(oldContent, newContent);
      diffLines = built.lines;
      sideBySideRows = buildSideBySideFromUnified(built.lines);
      additions = built.additions;
      deletions = built.deletions;
    }

    if (diffLines.length === 0) {
      diffLines = semanticFallbackLines(changes, file);
      sideBySideRows = buildSideBySideFromUnified(diffLines);
      const stats = countStats(diffLines);
      additions = stats.additions;
      deletions = stats.deletions;
    }

    const fileChanges = changes.filter((ch) => {
      const f =
        ch.target.source?.file ??
        config.fileMap[config.projectId] ??
        'demo-app/src/App.tsx';
      return f === file || (file.endsWith('.css') && (ch.kind === 'style' || ch.kind === 'layout'));
    });

    const desc =
      fileChanges.length === 1
        ? `${fileChanges[0].target.componentName ?? fileChanges[0].target.tag ?? 'element'} — ${String(fileChanges[0].payload.cssProperty ?? fileChanges[0].kind)}`
        : `${fileChanges.length} 处变更`;

    if (diffLines.length === 0) continue;

    hunks.push({
      id: `hunk_${file}`,
      file,
      description: desc,
      oldLines: [],
      newLines: [],
      selected: true,
      diffLines,
      sideBySideRows,
      additions,
      deletions,
    });
  }

  return hunks;
}
