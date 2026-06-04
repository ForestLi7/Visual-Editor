import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { importHtmlFile, uploadHtml } from '../api/importPage';
import { AppIcon } from '../components/AppIcon';
import demoHtml from '../../../fixtures/ve-feature-test.html?raw';
import './ConnectView.css';

const DEMO_PAGE_LABEL = '全功能演示';

type TabId = 'file' | 'paste';

export function ConnectView() {
  const connectImport = useEditorStore((s) => s.connectImport);

  const [tab, setTab] = useState<TabId>('file');
  const [pasteHtml, setPasteHtml] = useState('');
  const [pasteLabel, setPasteLabel] = useState('粘贴的网页');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearError = () => setError(null);

  const handleImportHtml = useCallback(
    async (html: string, label: string, source: 'file' | 'paste') => {
      clearError();
      setLoading(true);
      try {
        const result = await uploadHtml(html, label);
        if (!result.ok || !result.id) {
          setError(result.error ?? '导入失败');
          return;
        }
        connectImport(result.id, result.label ?? label, source);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [connectImport]
  );

  const onFile = async (file: File) => {
    if (!file.name.match(/\.(html?|htm)$/i) && !file.type.includes('html')) {
      setError('请选择 .html / .htm 文件');
      return;
    }
    setLoading(true);
    clearError();
    try {
      const result = await importHtmlFile(file);
      if (!result.ok || !result.id) {
        setError(result.error ?? '导入失败');
        return;
      }
      connectImport(result.id, result.label ?? file.name, 'file');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void onFile(file);
  };

  return (
    <div className="connect">
      <div className="connect__card">
        <div className="connect__logo">
          <AppIcon className="connect__logo-icon" size={28} />
          <span>Visual Editor</span>
        </div>

        <h1>开始编辑网页</h1>
        <p className="connect__desc">点选元素即可改样式、改文字，改完可导出 HTML。</p>

        <div className="connect__tabs" role="tablist">
          {(
            [
              { id: 'file' as const, label: '本地文件' },
              { id: 'paste' as const, label: '粘贴 HTML' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`connect__tab ${tab === t.id ? 'connect__tab--active' : ''}`}
              onClick={() => {
                setTab(t.id);
                clearError();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="connect__panel">
          {tab === 'file' && (
            <div className="connect__tab-panel">
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="connect__file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <div
                className={`connect__dropzone ${dragOver ? 'connect__dropzone--over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <p>拖放 HTML 文件到此处</p>
                <span>或点击选择 .html / .htm</span>
              </div>
            </div>
          )}

          {tab === 'paste' && (
            <div className="connect__tab-panel">
              <label className="connect__label">页面名称</label>
              <input
                type="text"
                className="connect__paste-name"
                value={pasteLabel}
                onChange={(e) => setPasteLabel(e.target.value)}
                placeholder="我的网页"
              />
              <label className="connect__label">HTML 源码</label>
              <textarea
                className="connect__textarea"
                value={pasteHtml}
                onChange={(e) => setPasteHtml(e.target.value)}
                placeholder="<!DOCTYPE html>&#10;<html>...</html>"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn--primary connect__paste-btn"
                disabled={loading || !pasteHtml.trim()}
                onClick={() => void handleImportHtml(pasteHtml, pasteLabel || '粘贴的网页', 'paste')}
              >
                {loading ? '导入中…' : '导入并打开'}
              </button>
            </div>
          )}
        </div>

        {error && <p className="connect__error">{error}</p>}

        <div className="connect__demo">
          <button
            type="button"
            className="connect__demo-btn"
            disabled={loading}
            onClick={() => void handleImportHtml(demoHtml, DEMO_PAGE_LABEL, 'paste')}
          >
            {loading ? '导入中…' : '打开全功能演示'}
          </button>
          <p className="connect__demo-hint">覆盖 Flex/Grid、媒体、Props、控制台与网络等能力</p>
        </div>
      </div>
    </div>
  );
}
