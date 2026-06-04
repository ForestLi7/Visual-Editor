/** 已知 CSS 属性的编辑方式（Design / CSS 面板复用） */

export type StyleFieldType = 'select' | 'range' | 'color' | 'text' | 'size';

export interface StyleFieldMeta {
  type: StyleFieldType;
  label?: string;
  options?: { value: string; label: string }[];
  /** size 类型：快捷预设（auto、100% 等） */
  presets?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const opt = (value: string, label?: string) => ({ value, label: label ?? value });

export const STYLE_FIELD_META: Record<string, StyleFieldMeta> = {
  display: {
    type: 'select',
    options: [
      opt('block'),
      opt('flex'),
      opt('inline'),
      opt('inline-block'),
      opt('inline-flex'),
      opt('grid'),
      opt('inline-grid'),
      opt('none'),
    ],
  },
  flexDirection: {
    type: 'select',
    options: [opt('row'), opt('column'), opt('row-reverse'), opt('column-reverse')],
  },
  flexWrap: {
    type: 'select',
    options: [opt('nowrap'), opt('wrap'), opt('wrap-reverse')],
  },
  justifyContent: {
    type: 'select',
    options: [
      opt('flex-start', '起点'),
      opt('center', '居中'),
      opt('flex-end', '终点'),
      opt('space-between', '两端'),
      opt('space-around', '环绕'),
      opt('space-evenly', '均匀'),
    ],
  },
  alignItems: {
    type: 'select',
    options: [
      opt('stretch', '拉伸'),
      opt('flex-start', '起点'),
      opt('center', '居中'),
      opt('flex-end', '终点'),
      opt('baseline', '基线'),
    ],
  },
  alignContent: {
    type: 'select',
    options: [
      opt('stretch'),
      opt('flex-start'),
      opt('center'),
      opt('flex-end'),
      opt('space-between'),
      opt('space-around'),
    ],
  },
  position: {
    type: 'select',
    options: [
      opt('static'),
      opt('relative'),
      opt('absolute'),
      opt('fixed'),
      opt('sticky'),
    ],
  },
  overflow: {
    type: 'select',
    options: [opt('visible'), opt('hidden'), opt('auto'), opt('scroll')],
  },
  textAlign: {
    type: 'select',
    options: [opt('left', '左'), opt('center', '中'), opt('right', '右'), opt('justify', '两端')],
  },
  textDecoration: {
    type: 'select',
    options: [opt('none'), opt('underline'), opt('line-through'), opt('overline')],
  },
  fontWeight: {
    type: 'select',
    options: [
      opt('normal'),
      opt('bold'),
      opt('100'),
      opt('200'),
      opt('300'),
      opt('400'),
      opt('500'),
      opt('600'),
      opt('700'),
      opt('800'),
      opt('900'),
    ],
  },
  fontSize: {
    type: 'select',
    options: [
      opt('12px', '12'),
      opt('14px', '14'),
      opt('16px', '16'),
      opt('18px', '18'),
      opt('20px', '20'),
      opt('24px', '24'),
      opt('28px', '28'),
      opt('32px', '32'),
      opt('40px', '40'),
      opt('48px', '48'),
    ],
  },
  lineHeight: {
    type: 'select',
    options: [opt('1'), opt('1.25'), opt('1.5'), opt('1.75'), opt('2'), opt('normal')],
  },
  width: {
    type: 'size',
    presets: ['auto', '100%', '50%', 'fit-content', 'max-content', 'min-content'],
  },
  height: {
    type: 'size',
    presets: ['auto', '100%', '50%', 'fit-content', 'max-content'],
  },
  minWidth: { type: 'size', unit: 'px' },
  maxWidth: { type: 'size', unit: 'px' },
  minHeight: { type: 'size', unit: 'px' },
  maxHeight: { type: 'size', unit: 'px' },
  gap: { type: 'range', min: 0, max: 64, step: 1, unit: 'px' },
  padding: { type: 'range', min: 0, max: 80, step: 1, unit: 'px' },
  margin: { type: 'range', min: 0, max: 80, step: 1, unit: 'px' },
  borderRadius: { type: 'range', min: 0, max: 48, step: 1, unit: 'px' },
  opacity: { type: 'range', min: 0, max: 1, step: 0.05, unit: '' },
  color: { type: 'color' },
  backgroundColor: { type: 'color' },
  borderStyle: {
    type: 'select',
    options: [opt('none'), opt('solid'), opt('dashed'), opt('dotted'), opt('double')],
  },
  gridTemplateColumns: {
    type: 'select',
    label: '列模板',
    options: [
      opt('1fr', '1 列'),
      opt('1fr 1fr', '2 列'),
      opt('repeat(3, 1fr)', '3 列'),
      opt('repeat(4, 1fr)', '4 列'),
      opt('200px 1fr', '固定 + 弹性'),
    ],
  },
  gridTemplateRows: {
    type: 'select',
    options: [opt('auto'), opt('1fr'), opt('1fr 1fr', '2 行'), opt('repeat(3, 1fr)', '3 行')],
  },
};

export function getStyleFieldMeta(cssKey: string): StyleFieldMeta | undefined {
  const camel = cssKey.includes('-') ? cssKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) : cssKey;
  return STYLE_FIELD_META[camel] ?? STYLE_FIELD_META[cssKey];
}

export function matchSelectOption(value: string, options: { value: string }[]): string {
  const v = value.trim();
  if (!v) return '';
  const hit = options.find((o) => o.value === v);
  if (hit) return hit.value;
  return '__custom__';
}
