/** 应用部署根路径（Vite `base`，如 `/` 或 `/visual-editor/`） */
export function appBasePath(): string {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/** 拼接同源 API / 静态资源路径（适配 nginx 子路径挂载） */
export function appUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = appBasePath();
  return `${base}${p}`;
}
