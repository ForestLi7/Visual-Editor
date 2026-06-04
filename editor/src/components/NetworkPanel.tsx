import { useMemo, useState } from 'react';
import type { NetworkEntry, NetworkResourceType } from '@ve/core';
import { useEditorStore } from '../store/editorStore';
import './NetworkPanel.css';

const TYPE_FILTERS: { id: 'all' | NetworkResourceType; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'fetch', label: 'fetch' },
  { id: 'xhr', label: 'xhr' },
  { id: 'img', label: 'img' },
  { id: 'script', label: 'script' },
  { id: 'css', label: 'css' },
];

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pathLabel(url: string): string {
  try {
    const u = new URL(url, 'http://local');
    return u.pathname.split('/').pop() || u.pathname || url;
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}…` : url;
  }
}

export function NetworkPanel() {
  const entries = useEditorStore((s) => s.networkEntries);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | NetworkResourceType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .reverse()
      .filter((e) => {
        if (typeFilter !== 'all' && e.resourceType !== typeFilter) return false;
        if (q && !e.url.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [entries, query, typeFilter]);

  const stats = useMemo(() => {
    const failed = entries.filter((e) => !e.ok).length;
    const totalSize = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
    return { total: entries.length, failed, totalSize };
  }, [entries]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0];

  return (
    <div className="network-panel">
      <div className="network-panel__toolbar">
        <span className="network-panel__stats">
          {stats.total} 项
          {stats.failed > 0 && <em className="network-panel__fail"> · {stats.failed} 失败</em>}
          {stats.totalSize > 0 && ` · ${formatSize(stats.totalSize)}`}
        </span>
        <input
          type="search"
          className="network-panel__search"
          placeholder="筛选 URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="network-panel__filters">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn--sm btn--ghost ${typeFilter === f.id ? 'network-panel__filter--on' : ''}`}
            onClick={() => setTypeFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="network-panel__body">
        {filtered.length === 0 ? (
          <p className="network-panel__empty">暂无网络记录。页面加载 fetch、XHR 或图片/脚本后会显示在此。</p>
        ) : (
          <table className="network-panel__table">
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>类型</th>
                <th>大小</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className={`network-panel__row ${!e.ok ? 'network-panel__row--fail' : ''} ${selected?.id === e.id ? 'network-panel__row--sel' : ''}`}
                  onClick={() => setSelectedId(e.id)}
                >
                  <td title={e.url}>{pathLabel(e.url)}</td>
                  <td>{e.status ?? (e.error ? '失败' : '—')}</td>
                  <td>{e.resourceType}</td>
                  <td>{formatSize(e.size)}</td>
                  <td>{e.durationMs !== null ? `${e.durationMs} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && (
        <div className="network-panel__detail">
          <div className="network-panel__detail-row">
            <span>URL</span>
            <code>{selected.url}</code>
          </div>
          <div className="network-panel__detail-row">
            <span>方法</span>
            <code>{selected.method}</code>
          </div>
          {selected.error && (
            <div className="network-panel__detail-row network-panel__detail-row--err">
              <span>错误</span>
              <code>{selected.error}</code>
            </div>
          )}
          <p className="network-panel__detail-hint">只读调试；跨域响应体不可读取。</p>
        </div>
      )}
    </div>
  );
}
