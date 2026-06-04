import { getStyleFieldMeta, matchSelectOption } from './styleFieldMeta';
import { SpacingSlider } from './SpacingSlider';
import { ColorPickerPopover } from './ColorPickerPopover';
import './StyleValueEditor.css';

function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function parsePx(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const t = raw.trim();
  if (t === 'normal' || t === 'auto') return fallback;
  const m = t.match(/^([\d.]+)/);
  return m ? Number(m[1]) : fallback;
}

interface StyleValueEditorProps {
  cssKey: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

export function StyleValueEditor({ cssKey, value, onChange, compact }: StyleValueEditorProps) {
  const meta = getStyleFieldMeta(cssKey);

  if (!meta) {
    return (
      <input
        type="text"
        className={compact ? 'css-panel__value' : undefined}
        defaultValue={value}
        onBlur={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onChange((e.target as HTMLInputElement).value)}
      />
    );
  }

  if (meta.type === 'select' && meta.options) {
    const selected = matchSelectOption(value, meta.options);
    const showCustom = selected === '__custom__';
    const selectValue = showCustom ? '__custom__' : selected || meta.options[0].value;
    return (
      <div className="style-value-editor style-value-editor--select">
        <select
          className={compact ? 'css-panel__value-select' : undefined}
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') return;
            onChange(v);
          }}
        >
          {meta.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="__custom__">自定义…</option>
        </select>
        {showCustom && (
          <input
            type="text"
            className="style-value-editor__custom"
            placeholder="输入值"
            defaultValue={value}
            onBlur={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onChange(e.currentTarget.value)}
          />
        )}
      </div>
    );
  }

  if (meta.type === 'size') {
    const placeholder = meta.unit ? `如 120${meta.unit}、100%、auto` : '如 auto、100%、120px';
    return (
      <div className="style-value-editor style-value-editor--size">
        {meta.presets && meta.presets.length > 0 && !compact && (
          <div className="style-value-editor__presets" role="group" aria-label="常用值">
            {meta.presets.map((p) => (
              <button
                key={p}
                type="button"
                className={
                  value.trim() === p ? 'style-value-editor__preset is-active' : 'style-value-editor__preset'
                }
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          className={compact ? 'css-panel__value' : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
    );
  }

  if (meta.type === 'range') {
    const unit = meta.unit ?? 'px';
    if (unit === 'px') {
      return (
        <SpacingSlider
          label={compact ? '' : meta.label ?? toKebab(cssKey)}
          value={value}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          unit={unit}
          onChange={onChange}
        />
      );
    }
    const num = parsePx(value, meta.min ?? 0);
    return (
      <label className="field field--compact">
        {!compact && <span>{meta.label ?? toKebab(cssKey)}</span>}
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={num}
          onInput={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (meta.type === 'color') {
    return <ColorPickerPopover value={value} onChange={onChange} compact={compact} />;
  }

  return (
    <input
      type="text"
      className={compact ? 'css-panel__value' : undefined}
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value)}
    />
  );
}
