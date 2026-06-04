import { useCallback, useEffect, useRef, useState } from 'react';
import { hexToHsv, hsvToHex, parseColorToHex } from './colorUtils';
import './ColorPicker.css';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

type DragKind = 'sv' | 'hue' | null;

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const hex = parseColorToHex(value);
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind>(null);

  useEffect(() => {
    if (dragRef.current) return;
    setHsv(hexToHsv(parseColorToHex(value)));
  }, [value]);

  const emit = useCallback(
    (next: typeof hsv) => {
      setHsv(next);
      onChange(hsvToHex(next));
    },
    [onChange]
  );

  const pickSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      emit({ ...hsvRef.current, s, v });
    },
    [emit]
  );

  const pickHue = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
      emit({ ...hsvRef.current, h });
    },
    [emit]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const kind = dragRef.current;
      if (!kind) return;
      e.preventDefault();
      if (kind === 'sv') pickSv(e.clientX, e.clientY);
      else pickHue(e.clientX);
    };

    const onEnd = () => endDrag();

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, [emit, pickSv, pickHue, endDrag]);

  const startSvDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = 'sv';
    svRef.current?.setPointerCapture(e.pointerId);
    pickSv(e.clientX, e.clientY);
  };

  const startHueDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = 'hue';
    hueRef.current?.setPointerCapture(e.pointerId);
    pickHue(e.clientX);
  };

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const currentHex = hsvToHex(hsv);

  return (
    <div className="color-picker">
      <div
        ref={svRef}
        className="color-picker__sv"
        style={{ backgroundColor: hueColor }}
        onPointerDown={startSvDrag}
        onLostPointerCapture={endDrag}
      >
        <div className="color-picker__sv-white" aria-hidden />
        <div className="color-picker__sv-black" aria-hidden />
        <span
          className="color-picker__sv-thumb"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>
      <div
        ref={hueRef}
        className="color-picker__hue"
        role="slider"
        aria-label="色相"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={startHueDrag}
        onLostPointerCapture={endDrag}
      >
        <span
          className="color-picker__hue-thumb"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="color-picker__row">
        <span className="color-picker__preview" style={{ backgroundColor: currentHex }} />
        <input
          type="text"
          className="color-picker__hex"
          value={currentHex}
          onChange={(e) => {
            const next = parseColorToHex(e.target.value);
            emit(hexToHsv(next));
          }}
        />
        <input
          type="color"
          className="color-picker__native"
          value={currentHex}
          onInput={(e) => emit(hexToHsv(e.target.value))}
          title="系统取色器"
        />
      </div>
    </div>
  );
}
