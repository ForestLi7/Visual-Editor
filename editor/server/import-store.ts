export interface ImportedPage {
  id: string;
  html: string;
  label: string;
  baseHref: string;
  createdAt: number;
}

const store = new Map<string, ImportedPage>();
const TTL_MS = 24 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, page] of store) {
    if (now - page.createdAt > TTL_MS) store.delete(id);
  }
}

export function saveImportedPage(
  html: string,
  label: string,
  baseHref = 'about:blank'
): ImportedPage {
  prune();
  const id = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const page: ImportedPage = {
    id,
    html,
    label,
    baseHref,
    createdAt: Date.now(),
  };
  store.set(id, page);
  return page;
}

export function getImportedPage(id: string): ImportedPage | undefined {
  const page = store.get(id);
  if (!page) return undefined;
  if (Date.now() - page.createdAt > TTL_MS) {
    store.delete(id);
    return undefined;
  }
  return page;
}
