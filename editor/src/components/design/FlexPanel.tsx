import type { SelectedNode } from '@ve/core';
import { StyleFieldRow } from './StyleFieldRow';
import { SpacingSlider } from './SpacingSlider';
import { AlignPicker } from './AlignPicker';

interface FlexPanelProps {
  selected: SelectedNode;
  update: (cssProperty: string, value: string) => void;
}

export function FlexPanel({ selected, update }: FlexPanelProps) {
  const s = selected.styles;
  const isRow = (s.flexDirection || 'row').includes('row');

  return (
    <section className="sidebar-section flex-panel">
      <h3>Flex</h3>
      <StyleFieldRow
        label="方向"
        cssKey="flexDirection"
        nodeId={selected.id}
        value={s.flexDirection || 'row'}
        onChange={(v) => update('flexDirection', v)}
      />
      <AlignPicker
        label="对齐（主轴 × 交叉轴）"
        justify={s.justifyContent || 'flex-start'}
        align={s.alignItems || 'stretch'}
        onJustifyChange={(v) => update('justifyContent', v)}
        onAlignChange={(v) => update('alignItems', v)}
      />
      <SpacingSlider
        key={`gap-${selected.id}-${s.gap}`}
        label="Gap"
        value={s.gap}
        max={64}
        onChange={(v) => update('gap', v)}
      />
      <p className="flex-panel__hint">
        {isRow ? '主轴为水平方向' : '主轴为垂直方向'} · 点选格子调整对齐
      </p>
    </section>
  );
}
