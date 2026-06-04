import type { NlpStyleIntent } from '@ve/core';

export interface NlpTextIntent {
  action: 'set' | 'append' | 'prepend';
  text: string;
}

export interface NlpParseResult {
  intents: NlpStyleIntent[];
  textIntent?: NlpTextIntent;
  summary: string;
  warnings: string[];
}

export interface NlpContext {
  tokens?: Record<string, string>;
  currentStyles?: Record<string, string>;
  currentText?: string;
}

/** 供 UI 展示的能力说明 */
export const NLP_CAPABILITIES = {
  style: [
    '变大 / 变小 / 放大 / 缩小',
    '加粗 / 变细',
    '改成红色、绿色、蓝色…（或 #hex）',
    '主色 / 品牌色',
    '背景红色、背景主色',
    '圆角 / 更圆',
    '居中',
    '间距加大 / padding',
    '透明 / 不透明',
    '隐藏 / 显示',
  ],
  text: [
    '文字改成… / 文本改为… / 内容设为…',
    '标题改成… / 文案改为…',
    '改成「引号内容」',
    '追加文字… / 加上…',
    '清空文字 / 删除文本',
  ],
} as const;

export const NLP_PLACEHOLDER =
  '样式：变大、红色、主色、加粗、圆角、居中…  文字：文字改成欢迎、清空文字、追加…';

const COLOR_MAP: Record<string, string> = {
  红: '#ff6b6b',
  红色: '#ff6b6b',
  绿: '#3ecf8e',
  绿色: '#3ecf8e',
  蓝: '#6c9eff',
  蓝色: '#6c9eff',
  白: '#ffffff',
  白色: '#ffffff',
  黑: '#0d0f12',
  黑色: '#0d0f12',
  橙: '#ff9f43',
  橙色: '#ff9f43',
  灰: '#8b929a',
  灰色: '#8b929a',
  red: '#ff6b6b',
  green: '#3ecf8e',
  blue: '#6c9eff',
  white: '#ffffff',
  black: '#0d0f12',
  orange: '#ff9f43',
  gray: '#8b929a',
};

const COLOR_WORD =
  /红|绿|蓝|白|黑|橙|灰|red|green|blue|white|black|orange|gray|#[0-9a-f]{3,8}/i;

function cleanTextValue(s: string): string {
  return s
    .replace(/^(?:文字|文本|内容|标题|文案)\s*/u, '')
    .replace(/^(?:为|成)\s*/u, '')
    .trim();
}

function parseTextIntent(raw: string): NlpTextIntent | undefined {
  const t = raw.trim();
  if (!t) return undefined;

  if (
    /(?:清空|删除|去掉|清除)(?:文字|文本|内容|文案)/u.test(t) ||
    /(?:文字|文本|内容|文案)(?:清空|删除|去掉)/u.test(t)
  ) {
    return { action: 'set', text: '' };
  }

  let m = t.match(/(?:追加|加上|后面加|添加|补充)(?:文字|文本|内容|文案)?[：:\s]*(.+)/u);
  if (m?.[1]) return { action: 'append', text: m[1].trim() };

  m = t.match(/(?:文字|文本|内容|标题|文案)(?:改成|改为|换成|设为|为|成)[：:\s]*(.+)/u);
  if (m?.[1]) {
    const val = cleanTextValue(m[1]);
    if (val && !looksLikeColorOnly(val)) return { action: 'set', text: val };
  }

  m = t.match(/把?(?:文字|文本|内容|标题|文案)(?:改成|改为|换成|设为)[：:\s]*(.+)/u);
  if (m?.[1]) {
    const val = cleanTextValue(m[1]);
    if (val && !looksLikeColorOnly(val)) return { action: 'set', text: val };
  }

  m = t.match(/(?:内容是|文本为|内容为|标题为|文案为)[：:\s]*(.+)/u);
  if (m?.[1]) return { action: 'set', text: m[1].trim() };

  m = t.match(/(?:改成|改为|换成|设为)[「"'](.+)[」"']/u);
  if (m?.[1]) return { action: 'set', text: m[1].trim() };

  m = t.match(/(?:命名为|叫作|叫做|名称改为)[：:\s]*(.+)/u);
  if (m?.[1]) return { action: 'set', text: m[1].trim() };

  return undefined;
}

function looksLikeColorOnly(val: string): boolean {
  const v = val.trim().toLowerCase();
  if (COLOR_MAP[v] || /^#[0-9a-f]{3,8}$/i.test(v)) return true;
  return COLOR_WORD.test(v) && v.length <= 8;
}

function describeTextIntent(intent: NlpTextIntent): string {
  if (intent.action === 'append') return `追加文字「${intent.text}」`;
  if (intent.text === '') return '清空文字';
  return `文字改为「${intent.text}」`;
}

/**
 * 规则引擎解析中英文 UI 编辑意图（V1，无需 LLM）
 */
export function parseNaturalLanguage(prompt: string, ctx: NlpContext = {}): NlpParseResult {
  const raw = prompt.trim();
  const text = raw.toLowerCase();
  const intents: NlpStyleIntent[] = [];
  const warnings: string[] = [];

  if (!raw) {
    return { intents: [], summary: '请输入描述', warnings: ['空指令'] };
  }

  const textIntent = parseTextIntent(raw);

  const bumpFont = (delta: number) => {
    const cur = parseFloat(ctx.currentStyles?.fontSize ?? '16') || 16;
    intents.push({ cssProperty: 'fontSize', value: `${Math.max(10, cur + delta)}px` });
  };

  if (/变大|放大|大一点|更大|larger|bigger/.test(text)) {
    bumpFont(4);
  }
  if (/变小|缩小|小一点|更小|smaller/.test(text)) {
    bumpFont(-4);
  }
  if (/加粗|粗体|bold/.test(text)) {
    intents.push({ cssProperty: 'fontWeight', value: '700' });
  }
  if (/变细|细体|normal|regular/.test(text)) {
    intents.push({ cssProperty: 'fontWeight', value: '400' });
  }
  if (/斜体|italic/.test(text)) {
    intents.push({ cssProperty: 'fontStyle', value: 'italic' });
  }
  if (/下划线|underline/.test(text)) {
    intents.push({ cssProperty: 'textDecoration', value: 'underline' });
  }
  if (/隐藏|不可见|hide/.test(text)) {
    intents.push({ cssProperty: 'display', value: 'none' });
  }
  if (/显示|show/.test(text) && !/文字|文本/.test(text)) {
    intents.push({ cssProperty: 'display', value: 'flex' });
  }
  if (/圆角|更圆/.test(text)) {
    intents.push({ cssProperty: 'borderRadius', value: '16px' });
  }
  if (/透明|变淡/.test(text)) {
    intents.push({ cssProperty: 'opacity', value: '0.6' });
  }
  if (/不透明|实/.test(text)) {
    intents.push({ cssProperty: 'opacity', value: '1' });
  }
  if (/左对齐|靠左/.test(text)) {
    intents.push({ cssProperty: 'textAlign', value: 'left' });
  }
  if (/右对齐|靠右/.test(text)) {
    intents.push({ cssProperty: 'textAlign', value: 'right' });
  }
  if (/居中|center/.test(text) && !/文字|文本|内容/.test(text)) {
    intents.push({ cssProperty: 'justifyContent', value: 'center' });
    intents.push({ cssProperty: 'alignItems', value: 'center' });
    intents.push({ cssProperty: 'textAlign', value: 'center' });
  }

  if (/主色|品牌色|primary/.test(text)) {
    intents.push({ cssProperty: 'color', value: 'var(--color-primary)' });
  }
  if (/背景.*主|主.*背景/.test(text)) {
    intents.push({ cssProperty: 'backgroundColor', value: 'var(--color-surface)' });
  }
  if (/间距|留白|padding/.test(text)) {
    const cur = parseFloat(ctx.currentStyles?.padding ?? '16') || 16;
    intents.push({ cssProperty: 'padding', value: `${cur + 8}px` });
  }

  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (text.includes(name.toLowerCase())) {
      const isBg = /背景|background|底/.test(text);
      intents.push({
        cssProperty: isBg ? 'backgroundColor' : 'color',
        value: hex,
      });
      break;
    }
  }

  if (/改成|改为|换成|设为|set/.test(text) && !textIntent) {
    const m = raw.match(/(?:改成|改为|换成|设为)\s*([#\w\u4e00-\u9fa5]+)/u);
    if (m?.[1]) {
      const key = m[1].toLowerCase();
      const v = COLOR_MAP[m[1]] ?? COLOR_MAP[key] ?? (m[1].startsWith('#') ? m[1] : undefined);
      if (v) {
        const isBg = /背景/.test(text);
        intents.push({ cssProperty: isBg ? 'backgroundColor' : 'color', value: v });
      }
    }
  }

  const parts: string[] = [];
  if (intents.length > 0) {
    parts.push(intents.map((i) => `${i.cssProperty}=${i.value}`).join('；'));
  }
  if (textIntent) {
    parts.push(describeTextIntent(textIntent));
  }

  if (intents.length === 0 && !textIntent) {
    warnings.push(
      '未能识别意图。样式：变大、红色、主色、加粗、圆角、居中；文字：文字改成欢迎、清空文字、追加备注'
    );
  }

  const summary = parts.length > 0 ? parts.join(' + ') : '无匹配操作';

  return { intents, textIntent, summary, warnings };
}
