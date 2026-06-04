import type { SemanticChange } from '@ve/core';
import { buildSideBySideFromUnified } from './sideBySideDiff.js';
import { semanticFallbackLines, countStats } from './previewDiff.js';
import type { FileHunk } from './types.js';

export function importPageFilePath(importId: string): string {
  return `imports/${importId}.html`;
}

/** 导入 HTML 预览：将变更归到虚拟 imports/{id}.html，生成语义 diff */
export function buildImportPageDiffs(
  changes: SemanticChange[],
  importId: string,
  pageLabel: string
): FileHunk[] {
  if (changes.length === 0) return [];

  const file = importPageFilePath(importId);
  const normalized = changes.map((ch) => ({
    ...ch,
    target: {
      ...ch.target,
      source: ch.target.source?.file?.startsWith('imports/')
        ? ch.target.source
        : { file, line: 0, column: 0 },
    },
  }));

  const diffLines = semanticFallbackLines(normalized, file);
  if (diffLines.length === 0) return [];

  const sideBySideRows = buildSideBySideFromUnified(diffLines);
  const stats = countStats(diffLines);
  const textCount = normalized.filter((c) => c.kind === 'text').length;
  const desc =
    textCount > 0 && normalized.length === textCount
      ? `${pageLabel} — ${textCount} 处文本`
      : `${pageLabel} — ${normalized.length} 处变更`;

  return [
    {
      id: `hunk_${file}`,
      file,
      description: desc,
      oldLines: [],
      newLines: [],
      selected: true,
      diffLines,
      sideBySideRows,
      additions: stats.additions,
      deletions: stats.deletions,
    },
  ];
}
