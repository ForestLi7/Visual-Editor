import { useMemo } from 'react';

interface SpacingSliderProps {
  label: string;
  value: string | undefined;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: string) => void;
}

function parsePx(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed === 'normal' || trimmed === 'auto' || trimmed === 'inherit' || trimmed === 'initial') {
    return fallback;
  }
  const m = trimmed.match(/^([\d.]+)/);
  return m ? Number(m[1]) : fallback;
}

export function SpacingSlider({
  label,
  value,
  min = 0,
  max = 96,
  step = 1,
  unit = 'px',
  onChange,
}: SpacingSliderProps) {
  const num = useMemo(() => parsePx(value, 0), [value]);

  return (
    <label className="field spacing-slider">
      <span className="spacing-slider__head">
        <span>{label}</span>
        <span className="spacing-slider__val">
          {num}
          {unit}
        </span>
      </span>
      <input
        type="range"
        className="spacing-slider__range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, num))}
        onInput={(e) => onChange(`${(e.target as HTMLInputElement).value}${unit}`)}
      />
    </label>
  );
}
