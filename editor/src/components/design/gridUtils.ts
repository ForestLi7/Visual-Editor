/** 解析 repeat(n, 1fr) 或纯 1fr 列/行模板为数量 */
export function parseRepeatFrTracks(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const t = value.trim();
  const repeat = t.match(/^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/i);
  if (repeat) {
    const n = parseInt(repeat[1], 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 1 && parts.length <= 12 && parts.every((p) => /^[\d.]*fr$/i.test(p))) {
    return parts.length;
  }
  return null;
}

export function tracksToRepeatFr(count: number): string {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  return `repeat(${n}, 1fr)`;
}

export function parseGapPx(value: string | undefined, fallback = 0): number {
  if (!value?.trim()) return fallback;
  const m = value.trim().match(/^([\d.]+)px$/);
  if (m) return Math.min(64, Math.max(0, parseFloat(m[1])));
  return fallback;
}

export function gapPxToString(px: number): string {
  return `${Math.round(px)}px`;
}

export function isFlexDisplay(display: string | undefined): boolean {
  const d = (display || '').toLowerCase();
  return d === 'flex' || d === 'inline-flex';
}

export function isGridDisplay(display: string | undefined): boolean {
  const d = (display || '').toLowerCase();
  return d === 'grid' || d === 'inline-grid';
}
