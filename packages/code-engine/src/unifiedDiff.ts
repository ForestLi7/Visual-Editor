export type DiffLineKind = 'hunk' | 'context' | 'add' | 'del';

export interface DiffDisplayLine {
  type: DiffLineKind;
  content: string;
  oldLine?: number;
  newLine?: number;
}

type DiffOp = { type: 'equal' | 'insert' | 'delete'; line: string };

/** 行级 LCS diff */
function diffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'equal', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'delete', line: oldLines[i - 1] });
      i--;
    }
  }
  return ops;
}

interface HunkRange {
  start: number;
  end: number;
}

function collectHunkRanges(ops: DiffOp[], context: number): HunkRange[] {
  const changeIdx: number[] = [];
  ops.forEach((op, i) => {
    if (op.type !== 'equal') changeIdx.push(i);
  });
  if (changeIdx.length === 0) return [];

  const ranges: HunkRange[] = [];
  let start = Math.max(0, changeIdx[0] - context);
  let end = Math.min(ops.length - 1, changeIdx[0] + context);

  for (let k = 1; k < changeIdx.length; k++) {
    const c = changeIdx[k];
    const s = Math.max(0, c - context);
    const e = Math.min(ops.length - 1, c + context);
    if (s <= end + 1) {
      end = e;
    } else {
      ranges.push({ start, end });
      start = s;
      end = e;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

function countOldLinesInRange(ops: DiffOp[], range: HunkRange): number {
  let n = 0;
  for (let i = range.start; i <= range.end; i++) {
    if (ops[i].type === 'equal' || ops[i].type === 'delete') n++;
  }
  return n;
}

function countNewLinesInRange(ops: DiffOp[], range: HunkRange): number {
  let n = 0;
  for (let i = range.start; i <= range.end; i++) {
    if (ops[i].type === 'equal' || ops[i].type === 'insert') n++;
  }
  return n;
}

/** 生成 Git 风格 unified diff 展示行（含 @@ 块头） */
export function buildUnifiedDiffLines(
  oldText: string,
  newText: string,
  context = 3
): { lines: DiffDisplayLine[]; additions: number; deletions: number } {
  if (oldText === newText) {
    return { lines: [], additions: 0, deletions: 0 };
  }

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const ops = diffOps(oldLines, newLines);

  let additions = 0;
  let deletions = 0;
  ops.forEach((op) => {
    if (op.type === 'insert') additions++;
    if (op.type === 'delete') deletions++;
  });

  const ranges = collectHunkRanges(ops, context);
  const display: DiffDisplayLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let opIndex = 0;

  for (const range of ranges) {
    while (opIndex < range.start) {
      const op = ops[opIndex];
      if (op.type === 'equal') {
        oldLine++;
        newLine++;
      } else if (op.type === 'delete') {
        oldLine++;
      } else {
        newLine++;
      }
      opIndex++;
    }

    const oldStart = oldLine;
    const newStart = newLine;
    const oldCount = countOldLinesInRange(ops, range);
    const newCount = countNewLinesInRange(ops, range);

    display.push({
      type: 'hunk',
      content: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    });

    for (let i = range.start; i <= range.end; i++) {
      const op = ops[i];
      if (op.type === 'equal') {
        display.push({
          type: 'context',
          content: op.line,
          oldLine,
          newLine,
        });
        oldLine++;
        newLine++;
      } else if (op.type === 'delete') {
        display.push({
          type: 'del',
          content: op.line,
          oldLine,
        });
        oldLine++;
      } else {
        display.push({
          type: 'add',
          content: op.line,
          newLine,
        });
        newLine++;
      }
    }
    opIndex = range.end + 1;
  }

  return { lines: display, additions, deletions };
}
