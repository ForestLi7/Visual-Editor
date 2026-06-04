import './TokenColorGrid.css';

interface TokenColorGridProps {
  tokens: Record<string, string>;
  /** token 键名，如 --color-primary */
  onPick: (tokenKey: string) => void;
  label?: string;
}

export function TokenColorGrid({ tokens, onPick, label = '设计 Token' }: TokenColorGridProps) {
  const entries = Object.entries(tokens);
  if (entries.length === 0) return null;

  return (
    <div className="token-grid">
      <span className="token-grid__label">{label}</span>
      <div className="token-grid__swatches" role="list">
        {entries.map(([key, hex]) => (
          <button
            key={key}
            type="button"
            className="token-grid__swatch"
            role="listitem"
            title={`${key} (${hex})`}
            style={{ background: hex }}
            onClick={() => onPick(key)}
          />
        ))}
      </div>
    </div>
  );
}
