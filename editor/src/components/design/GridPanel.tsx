import { useMemo, useState } from 'react';
import type { SelectedNode } from '@ve/core';
import { StyleFieldRow } from './StyleFieldRow';
import { SpacingSlider } from './SpacingSlider';
import { GridAlignPicker } from './AlignPicker';
import {
  gapPxToString,
  parseGapPx,
  parseRepeatFrTracks,
  tracksToRepeatFr,
} from './gridUtils';
import './GridPanel.css';

interface GridPanelProps {
  selected: SelectedNode;
  update: (cssProperty: string, value: string) => void;
}

export function GridPanel({ selected, update }: GridPanelProps) {
  const s = selected.styles;
  const colCount = useMemo(
    () => parseRepeatFrTracks(s.gridTemplateColumns) ?? 2,
    [s.gridTemplateColumns]
  );
  const rowCount = useMemo(
    () => parseRepeatFrTracks(s.gridTemplateRows) ?? 1,
    [s.gridTemplateRows]
  );
  const [advanced, setAdvanced] = useState(
    () =>
      parseRepeatFrTracks(s.gridTemplateColumns) === null && Boolean(s.gridTemplateColumns?.trim())
  );

  const colGap = parseGapPx(s.columnGap, parseGapPx(s.gap, 0));
  const rowGap = parseGapPx(s.rowGap, parseGapPx(s.gap, 0));

  const setColumns = (n: number) => {
    update('gridTemplateColumns', tracksToRepeatFr(n));
    setAdvanced(false);
  };

  const setRows = (n: number) => {
    update('gridTemplateRows', tracksToRepeatFr(n));
    setAdvanced(false);
  };

  return (
    <section className="sidebar-section grid-panel">
      <h3>Grid</h3>

      {!advanced && (
        <>
          <label className="field grid-panel__slider">
            列数 ({colCount})
            <input
              type="range"
              min={1}
              max={12}
              value={colCount}
              onChange={(e) => setColumns(Number(e.target.value))}
            />
          </label>
          <label className="field grid-panel__slider">
            行数 ({rowCount})
            <input
              type="range"
              min={1}
              max={12}
              value={rowCount}
              onChange={(e) => setRows(Number(e.target.value))}
            />
          </label>
        </>
      )}

      <button
        type="button"
        className="btn btn--sm btn--ghost grid-panel__advanced-toggle"
        onClick={() => setAdvanced((a) => !a)}
      >
        {advanced ? '使用滑块' : '高级模板'}
      </button>

      {advanced && (
        <>
          <StyleFieldRow
            label="列模板"
            cssKey="gridTemplateColumns"
            nodeId={selected.id}
            value={s.gridTemplateColumns}
            onChange={(v) => update('gridTemplateColumns', v)}
          />
          <StyleFieldRow
            label="行模板"
            cssKey="gridTemplateRows"
            nodeId={selected.id}
            value={s.gridTemplateRows}
            onChange={(v) => update('gridTemplateRows', v)}
          />
        </>
      )}

      <div className="grid-panel__gap-row">
        <SpacingSlider
          label="列间距"
          value={s.columnGap || gapPxToString(colGap)}
          max={64}
          onChange={(v) => update('columnGap', v)}
        />
        <SpacingSlider
          label="行间距"
          value={s.rowGap || gapPxToString(rowGap)}
          max={64}
          onChange={(v) => update('rowGap', v)}
        />
      </div>

      <GridAlignPicker
        label="单元格分布 (align-content)"
        value={s.alignContent || 'stretch'}
        onChange={(v) => update('alignContent', v)}
      />

      <AlignPicker
        label="子项对齐 (justify / align)"
        justify={s.justifyContent || 'stretch'}
        align={s.alignItems || 'stretch'}
        onJustifyChange={(v) => update('justifyContent', v)}
        onAlignChange={(v) => update('alignItems', v)}
        allowStretch
      />
    </section>
  );
}
