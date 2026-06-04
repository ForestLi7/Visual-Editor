import { appUrl } from '../utils/appBase';

export interface ImportHtmlResult {
  ok: boolean;
  id?: string;
  label?: string;
  error?: string;
}

export async function uploadHtml(
  html: string,
  label: string,
  baseHref?: string
): Promise<ImportHtmlResult> {
  const res = await fetch(appUrl('/api/import/html'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, label, baseHref }),
  });
  return (await res.json()) as ImportHtmlResult;
}

export async function importHtmlFile(file: File): Promise<ImportHtmlResult> {
  const html = await file.text();
  return uploadHtml(html, file.name);
}

const RECENT_KEY = 've_recent_imports';

export interface RecentImport {
  type: 'file';
  value: string;
  label: string;
  at: string;
}

export function loadRecentImports(): RecentImport[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentImport[];
  } catch {
    return [];
  }
}

export function pushRecentImport(entry: RecentImport) {
  const list = loadRecentImports().filter((r) => r.value !== entry.value);
  list.unshift(entry);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}
