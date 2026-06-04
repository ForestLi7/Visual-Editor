import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  buildSideBySideFromUnified,
  findChangeBlocks,
  getChangeRowIndices,
  type DiffDisplayLine,
  type FileHunk,
  type SideBySideCell,
  type SideBySideRow,
} from '@ve/code-engine';
import './GitDiffView.css';

const LINE_HEIGHT = 20;

function rowsFromHunk(hunk: FileHunk): SideBySideRow[] {
  if (hunk.sideBySideRows?.length) return hunk.sideBySideRows;
  if (hunk.diffLines?.length) return buildSideBySideFromUnified(hunk.diffLines);

  const diffLines: DiffDisplayLine[] = [];
  let o = 1;
  let n = 1;
  hunk.oldLines.forEach((c) => diffLines.push({ type: 'del', content: c, oldLine: o++ }));
  hunk.newLines.forEach((c) => diffLines.push({ type: 'add', content: c, newLine: n++ }));
  return buildSideBySideFromUnified(diffLines);
}

function renderHighlighted(cell: SideBySideCell): ReactNode {
  const text = cell.content || ' ';
  const spans = cell.highlight;
  if (!spans?.length) {
    return <code>{text}</code>;
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  spans.forEach((span, idx) => {
    if (span.start > pos) {
      parts.push(<span key={`t-${idx}-pre`}>{text.slice(pos, span.start)}</span>);
    }
    parts.push(
      <mark key={`h-${idx}`} className="sbs-diff__inline-mark">
        {text.slice(span.start, span.end)}
      </mark>
    );
    pos = span.end;
  });
  if (pos < text.length) {
    parts.push(<span key="tail">{text.slice(pos)}</span>);
  }
  return <code>{parts}</code>;
}

function codeCellClass(cell: SideBySideCell | null | undefined, side: 'left' | 'right'): string {
  if (!cell || cell.kind === 'empty') {
    return `sbs-diff__code-cell sbs-diff__code-cell--ghost sbs-diff__code-cell--${side}`;
  }
  return `sbs-diff__code-cell sbs-diff__code-cell--${side} sbs-diff__code-cell--${cell.kind}`;
}

function GutterConnectors({ blocks, rowCount }: { blocks: { startRow: number; endRow: number }[]; rowCount: number }) {
  const h = Math.max(rowCount * LINE_HEIGHT, LINE_HEIGHT);
  return (
    <svg
      className="sbs-diff__gutter-svg"
      width="28"
      height={h}
      viewBox={`0 0 28 ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {blocks.map((b, i) => {
        const y1 = b.startRow * LINE_HEIGHT + 2;
        const y2 = (b.endRow + 1) * LINE_HEIGHT - 2;
        return (
          <path
            key={i}
            className="sbs-diff__connector"
            d={`M 2 ${y1} L 26 ${y1} L 26 ${y2} L 2 ${y2} Z`}
          />
        );
      })}
    </svg>
  );
}

function ScrollMinimap({
  rows,
  changeIndices,
  scrollRatio,
  onSeek,
}: {
  rows: SideBySideRow[];
  changeIndices: number[];
  scrollRatio: number;
  onSeek: (ratio: number) => void;
}) {
  const markers = useMemo(() => {
    if (rows.length === 0) return [];
    return changeIndices.map((rowIdx) => ({
      top: (rowIdx / rows.length) * 100,
      kind:
        rows[rowIdx].left?.kind === 'delete'
          ? 'del'
          : rows[rowIdx].right?.kind === 'insert'
            ? 'add'
            : 'both',
    }));
  }, [rows, changeIndices]);

  return (
    <div
      className="sbs-diff__minimap"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientY - rect.top) / rect.height);
      }}
      role="presentation"
    >
      {markers.map((m, i) => (
        <span
          key={i}
          className={`sbs-diff__minimap-mark sbs-diff__minimap-mark--${m.kind}`}
          style={{ top: `${m.top}%` }}
        />
      ))}
      <span className="sbs-diff__minimap-thumb" style={{ top: `${scrollRatio * 100}%` }} />
    </div>
  );
}

interface GitDiffFileProps {
  hunk: FileHunk;
  onToggle: () => void;
}

export function GitDiffFile({ hunk, onToggle }: GitDiffFileProps) {
  const rows = useMemo(() => rowsFromHunk(hunk), [hunk]);
  const blocks = useMemo(() => findChangeBlocks(rows), [rows]);
  const changeIndices = useMemo(() => getChangeRowIndices(rows), [rows]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [changeCursor, setChangeCursor] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);

  const adds = hunk.additions ?? rows.filter((r) => r.right?.kind === 'insert').length;
  const dels = hunk.deletions ?? rows.filter((r) => r.left?.kind === 'delete').length;
  const diffCount = changeIndices.length;

  const scrollToChange = useCallback(
    (index: number) => {
      if (changeIndices.length === 0) return;
      const clamped = ((index % changeIndices.length) + changeIndices.length) % changeIndices.length;
      setChangeCursor(clamped);
      rowRefs.current.get(changeIndices[clamped])?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [changeIndices]
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrollRatio(max > 0 ? el.scrollTop / max : 0);
  };

  return (
    <article className="git-diff-file">
      <header className="git-diff-file__header">
        <label className="git-diff-file__select">
          <input type="checkbox" checked={hunk.selected} onChange={onToggle} />
          <span className="git-diff-file__path">{hunk.file}</span>
        </label>
        <span className="git-diff-file__desc">{hunk.description}</span>
        <span className="git-diff-file__stats">
          {diffCount > 0 && (
            <span className="git-diff-file__stat git-diff-file__stat--muted">
              {diffCount} {'\u5904\u5dee\u5f02'}
            </span>
          )}
          {adds > 0 && <span className="git-diff-file__stat git-diff-file__stat--add">+{adds}</span>}
          {dels > 0 && <span className="git-diff-file__stat git-diff-file__stat--del">-{dels}</span>}
        </span>
      </header>

      <div className="git-diff-file__toolbar">
        <span className="git-diff-file__view-label">{'\u5e76\u6392\u5bf9\u6bd4'}</span>
        <div className="git-diff-file__nav">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={diffCount === 0}
            onClick={() => scrollToChange(changeCursor - 1)}
            title="Previous change"
          >
            ?
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={diffCount === 0}
            onClick={() => scrollToChange(changeCursor + 1)}
            title="Next change"
          >
            ?
          </button>
          <span className="git-diff-file__nav-pos">
            {diffCount === 0 ? '-' : `${changeCursor + 1} / ${diffCount}`}
          </span>
        </div>
      </div>

      <div className="sbs-diff__panes-head">
        <span className="sbs-diff__pane-title sbs-diff__pane-title--old">{'\u539f\u59cb'}</span>
        <span className="sbs-diff__pane-title sbs-diff__pane-title--new">{'\u4fee\u6539\u540e'}</span>
      </div>

      <div className="sbs-diff__scroll-outer">
        <div className="sbs-diff__scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="sbs-diff__gutter-overlay" style={{ height: rows.length * LINE_HEIGHT }}>
            <GutterConnectors blocks={blocks} rowCount={rows.length} />
          </div>
          <table className="sbs-diff" style={{ '--sbs-line-height': `${LINE_HEIGHT}px` } as CSSProperties}>
            <tbody>
              {rows.map((row, rowIdx) => {
                const isChange = changeIndices.includes(rowIdx);
                const isActive = changeIndices[changeCursor] === rowIdx;
                return (
                  <tr
                    key={rowIdx}
                    ref={(el) => {
                      if (el) rowRefs.current.set(rowIdx, el);
                      else rowRefs.current.delete(rowIdx);
                    }}
                    className={`sbs-diff__row ${isChange ? 'sbs-diff__row--change' : ''} ${isActive ? 'sbs-diff__row--active' : ''}`}
                  >
                    <td className="sbs-diff__ln-cell">{row.left?.lineNum ?? ''}</td>
                    <td className={codeCellClass(row.left, 'left')}>
                      {row.left && row.left.kind !== 'empty' ? renderHighlighted(row.left) : null}
                    </td>
                    <td className="sbs-diff__bridge-cell" aria-hidden />
                    <td className="sbs-diff__ln-cell">{row.right?.lineNum ?? ''}</td>
                    <td className={codeCellClass(row.right, 'right')}>
                      {row.right && row.right.kind !== 'empty' ? renderHighlighted(row.right) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ScrollMinimap
          rows={rows}
          changeIndices={changeIndices}
          scrollRatio={scrollRatio}
          onSeek={(ratio) => {
            const el = scrollRef.current;
            if (!el) return;
            el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
          }}
        />
      </div>
    </article>
  );
}
