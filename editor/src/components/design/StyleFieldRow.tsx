import { StyleValueEditor } from './StyleValueEditor';

export function StyleFieldRow({
  label,
  cssKey,
  value,
  onChange,
  nodeId,
}: {
  label: string;
  cssKey: string;
  value: string | undefined;
  onChange: (v: string) => void;
  nodeId: string;
}) {
  const v = value ?? '';
  return (
    <label className="field">
      {label}
      <StyleValueEditor
        key={`${nodeId}-${cssKey}`}
        cssKey={cssKey}
        value={v}
        onChange={onChange}
      />
    </label>
  );
}
