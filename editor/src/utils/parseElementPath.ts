export interface PathCrumb {
  label: string;
  nodeId: string | null;
}

/** 解析 `body#ve-body-1 > div#ve-div-2` 形式路径 */
export function parseElementPath(path: string, bodyFallbackId?: string): PathCrumb[] {
  return path
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === 'body') {
        return { label: 'body', nodeId: bodyFallbackId ?? null };
      }
      const hash = segment.indexOf('#');
      if (hash >= 0) {
        return {
          label: segment.slice(0, hash),
          nodeId: segment.slice(hash + 1),
        };
      }
      return { label: segment, nodeId: null };
    });
}
