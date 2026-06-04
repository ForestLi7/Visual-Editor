import type { DiffDisplayLine } from './unifiedDiff.js';
import { buildUnifiedDiffLines } from './unifiedDiff.js';

export type SideCellKind = 'equal' | 'delete' | 'insert' | 'empty';

export interface TextSpan {
  start: number;
  end: number;
}

export interface SideBySideCell {
  lineNum?: number;
  content: string;
  kind: SideCellKind;
  highlight?: TextSpan[];
}

export interface SideBySideRow {
  left: SideBySideCell | null;
  right: SideBySideCell | null;
  /** 同一逻辑行的修改（左右均有内容且不同） */
  modify?: boolean;
}

export interface ChangeBlockIndex {
  startRow: number;
  endRow: number;
}

/** 行内差异高亮（共同前缀/后缀之外的部分） */
export function inlineDiffSpans(oldText: string, newText: string): {
  oldHighlight: TextSpan[];
  newHighlight: TextSpan[];
} {
  let pre = 0;
  const oLen = oldText.length;
  const nLen = newText.length;
  while (pre < oLen && pre < nLen && oldText[pre] === newText[pre]) pre++;

  let suf = 0;
  while (
    suf < oLen - pre &&
    suf < nLen - pre &&
    oldText[oLen - 1 - suf] === newText[nLen - 1 - suf]
  ) {
    suf++;
  }

  const oEnd = oLen - suf;
  const nEnd = nLen - suf;
  return {
    oldHighlight: pre < oEnd ? [{ start: pre, end: oEnd }] : [],
    newHighlight: pre < nEnd ? [{ start: pre, end: nEnd }] : [],
  };
}

function emptyCell(): SideBySideCell {
  return { content: '', kind: 'empty' };
}

/** 将 unified diff 行转为左右对齐的分栏行 */
export function buildSideBySideFromUnified(lines: DiffDisplayLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'hunk') {
      i++;
      continue;
    }

    if (line.type === 'del' && lines[i + 1]?.type === 'add') {
      const next = lines[i + 1];
      const { oldHighlight, newHighlight } = inlineDiffSpans(line.content, next.content);
      rows.push({
        modify: true,
        left: {
          lineNum: line.oldLine,
          content: line.content,
          kind: 'delete',
          highlight: oldHighlight.length ? oldHighlight : [{ start: 0, end: line.content.length }],
        },
        right: {
          lineNum: next.newLine,
          content: next.content,
          kind: 'insert',
          highlight: newHighlight.length ? newHighlight : [{ start: 0, end: next.content.length }],
        },
      });
      i += 2;
      continue;
    }

    if (line.type === 'context') {
      rows.push({
        left: { lineNum: line.oldLine, content: line.content, kind: 'equal' },
        right: { lineNum: line.newLine, content: line.content, kind: 'equal' },
      });
    } else if (line.type === 'del') {
      rows.push({
        left: { lineNum: line.oldLine, content: line.content, kind: 'delete' },
        right: emptyCell(),
      });
    } else if (line.type === 'add') {
      rows.push({
        left: emptyCell(),
        right: { lineNum: line.newLine, content: line.content, kind: 'insert' },
      });
    }
    i++;
  }

  return rows;
}

export function buildSideBySideDiff(
  oldText: string,
  newText: string,
  context = 3
): { rows: SideBySideRow[]; additions: number; deletions: number } {
  const built = buildUnifiedDiffLines(oldText, newText, context);
  return {
    rows: buildSideBySideFromUnified(built.lines),
    additions: built.additions,
    deletions: built.deletions,
  };
}

export function isChangeRow(row: SideBySideRow): boolean {
  if (row.modify) return true;
  if (!row.left || row.left.kind === 'empty') return row.right?.kind !== 'equal';
  if (!row.right || row.right.kind === 'empty') return row.left.kind !== 'equal';
  return row.left.kind !== 'equal' || row.right.kind !== 'equal';
}

export function findChangeBlocks(rows: SideBySideRow[]): ChangeBlockIndex[] {
  const blocks: ChangeBlockIndex[] = [];
  let start = -1;

  for (let i = 0; i < rows.length; i++) {
    const changed = isChangeRow(rows[i]);
    if (changed && start < 0) start = i;
    if ((!changed || i === rows.length - 1) && start >= 0) {
      const end = changed && i === rows.length - 1 ? i : i - 1;
      if (end >= start) blocks.push({ startRow: start, endRow: end });
      start = -1;
    }
  }
  return blocks;
}

export function getChangeRowIndices(rows: SideBySideRow[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (isChangeRow(rows[i])) indices.push(i);
  }
  return [...new Set(indices)];
}
