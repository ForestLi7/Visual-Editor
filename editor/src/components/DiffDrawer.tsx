import { useState } from 'react';
import { reloadPreview } from '../bridge/iframeBridge';
import { appUrl } from '../utils/appBase';
import { useEditorStore } from '../store/editorStore';
import { GitDiffFile } from './GitDiffView';
import config from '../../../.visualeditorrc.json';
import './DiffDrawer.css';

const TARGET_HINT =
  Object.values((config as { fileMap?: Record<string, string> }).fileMap ?? {}).join('、') ||
  'demo-app';

export function DiffDrawer() {
  const hunks = useEditorStore((s) => s.hunks);
  const diffLoading = useEditorStore((s) => s.diffLoading);
  const pendingChanges = useEditorStore((s) => s.pendingChanges);
  const closeDiff = useEditorStore((s) => s.closeDiff);
  const toggleHunk = useEditorStore((s) => s.toggleHunk);
  const clearPending = useEditorStore((s) => s.clearPending);
  const applyNote = useEditorStore((s) => s.applyNote);
  const setApplyNote = useEditorStore((s) => s.setApplyNote);
  const importId = useEditorStore((s) => s.importId);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImportedPreview = Boolean(importId);

  const selectedCount = hunks.filter((h) => h.selected).length;

  const applySelected = async () => {
    const selectedHunks = hunks.filter((h) => h.selected);
    if (selectedHunks.length === 0) {
      setStatus('请至少勾选一个文件');
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(appUrl('/api/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: pendingChanges,
          files: selectedHunks.map((h) => ({ path: h.file })),
          note: applyNote,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        applied?: string[];
        errors?: string[];
        error?: string;
      };
      if (data.ok) {
        const n = data.applied?.length ?? 0;
        clearPending();
        if (isImportedPreview) {
          // 导入 HTML 预览与 demo-app 源码无关；reload 会丢掉会话内 styleOverrides
          setStatus(
            `已写入 ${n} 个源码文件（${TARGET_HINT}）。当前画布仍为导入页预览，编辑已保留；保存页面请用「导出 HTML」。`
          );
        } else {
          setStatus(`已写入 ${n} 个文件，正在刷新预览…`);
          reloadPreview();
        }
        setTimeout(closeDiff, isImportedPreview ? 2800 : 1200);
      } else {
        setStatus(data.errors?.join('; ') ?? data.error ?? '应用失败');
      }
    } catch (e) {
      setStatus(String(e));
    } finally {
      setLoading(false);
    }
  };

  const selectAll = () => {
    useEditorStore.setState({
      hunks: hunks.map((h) => ({ ...h, selected: true })),
    });
  };

  const selectNone = () => {
    useEditorStore.setState({
      hunks: hunks.map((h) => ({ ...h, selected: false })),
    });
  };

  const totalAdd = hunks.reduce((n, h) => n + (h.additions ?? 0), 0);
  const totalDel = hunks.reduce((n, h) => n + (h.deletions ?? 0), 0);

  return (
    <div
      className="diff-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="变更预览"
      onClick={closeDiff}
    >
      <div className="diff-drawer__panel" onClick={(e) => e.stopPropagation()}>
        <header className="diff-drawer__header">
          <div className="diff-drawer__title-wrap">
            <h2>变更 Diff</h2>
            <span className="diff-drawer__meta">
              {pendingChanges.length} 项待应用 · 目标 {TARGET_HINT}
              {totalAdd + totalDel > 0 && (
                <>
                  {' · '}
                  <span className="diff-drawer__stat diff-drawer__stat--add">+{totalAdd}</span>
                  {' '}
                  <span className="diff-drawer__stat diff-drawer__stat--del">−{totalDel}</span>
                </>
              )}
            </span>
            <p className="diff-drawer__hint">
              {isImportedPreview ? (
                <>
                  当前为<strong>导入页</strong>模式：文本等变更会记录到虚拟文件{' '}
                  <code>imports/…html</code> 的语义 diff；「应用选中」仍写入 monorepo 源码（{TARGET_HINT}），与导入页无直接对应。保存导入页请用「导出 HTML」。
                </>
              ) : (
                <>
                  Diff 对比 monorepo 源码（{TARGET_HINT}）。「应用选中」将写回磁盘并刷新预览。
                </>
              )}
            </p>
          </div>
          <div className="diff-drawer__actions">
            <button type="button" className="btn btn--sm btn--ghost" onClick={closeDiff}>
              关闭
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={loading || diffLoading || selectedCount === 0}
              onClick={applySelected}
            >
              {loading ? '应用中…' : `应用选中 (${selectedCount})`}
            </button>
          </div>
        </header>
        <div className="diff-drawer__toolbar">
          <label className="diff-drawer__note">
            <span>变更备注（可选）</span>
            <input
              type="text"
              value={applyNote}
              onChange={(e) => setApplyNote(e.target.value)}
              placeholder="例：调整卡片间距与主色"
            />
          </label>
          {!diffLoading && hunks.length > 0 && (
            <div className="diff-drawer__bulk">
              <button type="button" className="btn btn--sm btn--ghost" onClick={selectAll}>
                全选
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={selectNone}>
                全不选
              </button>
            </div>
          )}
        </div>
        <div className="diff-drawer__body">
          {diffLoading && (
            <p className="diff-drawer__loading">正在生成并排 diff…</p>
          )}
          {!diffLoading && hunks.length === 0 && (
            <p className="diff-drawer__empty">未能生成 diff，请确认存在待应用变更且项目文件可读</p>
          )}
          {!diffLoading &&
            hunks.map((h) => (
              <GitDiffFile key={h.id} hunk={h} onToggle={() => toggleHunk(h.id)} />
            ))}
        </div>
        {status && <footer className="diff-drawer__status">{status}</footer>}
      </div>
    </div>
  );
}
