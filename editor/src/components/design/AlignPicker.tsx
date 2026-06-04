import './AlignPicker.css';

const COLS = [
  { value: 'flex-start', title: '起点' },
  { value: 'center', title: '居中' },
  { value: 'flex-end', title: '终点' },
] as const;

const ROWS = [
  { value: 'flex-start', title: '起点' },
  { value: 'center', title: '居中' },
  { value: 'flex-end', title: '终点' },
] as const;

type AlignValue = (typeof COLS)[number]['value'] | 'stretch';

interface AlignPickerProps {
  label: string;
  justify: string;
  align: string;
  onJustifyChange: (v: string) => void;
  onAlignChange: (v: string) => void;
  allowStretch?: boolean;
}

function normJustify(v: string): string {
  if (COLS.some((c) => c.value === v)) return v;
  if (v === 'start') return 'flex-start';
  if (v === 'end') return 'flex-end';
  return 'flex-start';
}

function normAlign(v: string): string {
  if (v === 'stretch') return 'stretch';
  if (ROWS.some((r) => r.value === v)) return v;
  if (v === 'start') return 'flex-start';
  if (v === 'end') return 'flex-end';
  return 'stretch';
}

export function AlignPicker({
  label,
  justify,
  align,
  onJustifyChange,
  onAlignChange,
  allowStretch = true,
}: AlignPickerProps) {
  const j = normJustify(justify);
  const a = normAlign(align);

  return (
    <div className="align-picker">
      <span className="align-picker__label">{label}</span>
      <div className="align-picker__grid" role="group" aria-label={label}>
        {ROWS.map((row) =>
          COLS.map((col) => {
            const active = j === col.value && a === row.value;
            return (
              <button
                key={`${row.value}-${col.value}`}
                type="button"
                className={`align-picker__cell ${active ? 'align-picker__cell--active' : ''}`}
                title={`主轴 ${col.title} · 交叉轴 ${row.title}`}
                aria-pressed={active}
                onClick={() => {
                  onJustifyChange(col.value);
                  onAlignChange(row.value);
                }}
              >
                <span className="align-picker__dot" />
              </button>
            );
          })
        )}
      </div>
      <div className="align-picker__axis-hint">
        <span>← 主轴对齐</span>
        <span>↑ 交叉轴</span>
      </div>
      {allowStretch && (
        <button
          type="button"
          className={`align-picker__stretch ${a === 'stretch' ? 'align-picker__stretch--active' : ''}`}
          onClick={() => onAlignChange('stretch')}
        >
          拉伸 (stretch)
        </button>
      )}
    </div>
  );
}

interface GridAlignPickerProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function GridAlignPicker({ label, value, onChange }: GridAlignPickerProps) {
  const v = value || 'stretch';
  const presets: { value: string; title: string }[] = [
    { value: 'start', title: '起点' },
    { value: 'center', title: '居中' },
    { value: 'end', title: '终点' },
    { value: 'stretch', title: '拉伸' },
    { value: 'space-between', title: '两端' },
    { value: 'space-around', title: '环绕' },
  ];

  return (
    <div className="align-picker">
      <span className="align-picker__label">{label}</span>
      <div className="align-picker__presets" role="group">
        {presets.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`btn btn--sm btn--ghost ${v === p.value ? 'align-picker__preset--active' : ''}`}
            onClick={() => onChange(p.value)}
          >
            {p.title}
          </button>
        ))}
      </div>
    </div>
  );
}
