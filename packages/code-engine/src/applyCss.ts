import type { SemanticChange } from '@ve/core';

function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 在指定选择器规则块内更新或插入 CSS 属性 */
export function applyPropertyInRule(
  content: string,
  selector: string,
  cssProperty: string,
  value: string
): string {
  const prop = toKebab(cssProperty);
  const sel = escapeRegExp(selector.trim());
  const blockRe = new RegExp(`(${sel}\\s*\\{)([\\s\\S]*?)(\\})`, 'm');

  const blockMatch = content.match(blockRe);
  if (!blockMatch) return content;

  const open = blockMatch[1];
  const body = blockMatch[2];
  const close = blockMatch[3];
  const propRe = new RegExp(`(^|\\n)(\\s*)(${escapeRegExp(prop)})(\\s*:\\s*)([^;]+)(;)`, 'm');

  let newBody: string;
  if (propRe.test(body)) {
    newBody = body.replace(propRe, `$1$2$3$4${value}$6`);
  } else {
    const indent = body.match(/\n(\s+)\S/)?.[1] ?? '  ';
    const prefix = body.endsWith('\n') || !body.trim() ? body : `${body}\n`;
    newBody = `${prefix}${indent}${prop}: ${value};\n`;
  }

  return content.replace(blockRe, `${open}${newBody}${close}`);
}

/** 将样式变更写入 CSS 文件（按元素选择器定位规则块） */
export function applyChangesToCss(content: string, changes: SemanticChange[]): string {
  let result = content;

  for (const ch of changes) {
    if (ch.kind !== 'style' && ch.kind !== 'layout') continue;
    const prop = String(ch.payload.cssProperty ?? ch.payload.property ?? '');
    const value = String(ch.payload.value ?? '');
    if (!prop || !value) continue;

    const selector = String(
      ch.payload.selector ?? ch.target.cssSelector ?? ''
    ).trim();
    if (!selector) {
      const cssProp = toKebab(prop);
      const re = new RegExp(`(${escapeRegExp(cssProp)}\\s*:\\s*)([^;]+)(;)`, 'g');
      if (re.test(result)) {
        result = result.replace(re, `$1${value}$3`);
      }
      continue;
    }

    result = applyPropertyInRule(result, selector, prop, value);
  }

  return result;
}
