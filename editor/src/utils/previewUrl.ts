import { appUrl } from './appBase';

/** 本地/粘贴导入的页面（经编辑器 API 注入 Inspector） */
export function resolveImportPageSrc(importId: string): string {
  return appUrl(`/api/import/page?id=${encodeURIComponent(importId)}`);
}
