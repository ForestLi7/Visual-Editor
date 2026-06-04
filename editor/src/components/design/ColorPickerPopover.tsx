import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ColorPicker } from './ColorPicker';
import { parseColorToHex } from './colorUtils';
import './ColorPickerPopover.css';

interface ColorPickerPopoverProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

function swatchStyle(value: string): CSSProperties {
  const t = (value ?? '').trim();
  if (!t) return { backgroundColor: '#e8eaed' };
  if (t.startsWith('var(')) return { background: t };
  return { backgroundColor: parseColorToHex(t) };
}

export function ColorPickerPopover({ value, onChange, compact }: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const [dropStyle, setDropStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const isToken = (displayValue ?? '').trim().includes('var(');
  const displayHex = isToken ? displayValue : parseColorToHex(displayValue);

  const handleChange = useCallback(
    (next: string) => {
      setDisplayValue(next);
      onChange(next);
    },
    [onChange]
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const dropW = Math.min(240, window.innerWidth - 16);
    let left = rect.left;
    if (left + dropW > window.innerWidth - 8) {
      left = window.innerWidth - dropW - 8;
    }
    left = Math.max(8, left);

    const spaceBelow = window.innerHeight - rect.bottom;
    const preferBelow = spaceBelow >= 200 || spaceBelow >= rect.top;
    const top = preferBelow ? rect.bottom + 6 : rect.top - 6;
    const transform = preferBelow ? undefined : 'translateY(-100%)';

    setDropStyle({
      position: 'fixed',
      top,
      left,
      width: dropW,
      transform,
      zIndex: 10000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    <div
      ref={rootRef}
      className={`color-picker-popover ${compact ? 'color-picker-popover--compact' : ''}`}
    >
      <div className="color-picker-popover__trigger">
        <button
          ref={triggerRef}
          type="button"
          className="color-picker-popover__swatch"
          style={swatchStyle(displayValue)}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="打开颜色选择器"
        />
        <input
          type="text"
          className="color-picker-popover__hex"
          value={isToken ? displayValue : displayHex}
          readOnly
          aria-readonly
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          }}
          title={isToken ? displayValue : displayHex}
        />
      </div>
      {open &&
        createPortal(
          <div
            ref={dropRef}
            className="color-picker-popover__drop"
            style={dropStyle}
            role="dialog"
            aria-label="颜色选择"
          >
            <ColorPicker value={displayValue} onChange={handleChange} />
          </div>,
          document.body
        )}
    </div>
  );
}
