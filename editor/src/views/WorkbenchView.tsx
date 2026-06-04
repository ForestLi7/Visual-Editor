import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { setIframeRef, restoreSnapshots, setEditorMode, startTextEdit } from '../bridge/iframeBridge';
import { requestExportHtml } from '../bridge/exportHtml';
import { scheduleRuntimeInit } from '../bridge/setupBridge';
import { downloadTextFile, sanitizeFilename } from '../utils/downloadFile';
import { patchExportedHtmlWithPendingChanges } from '../utils/patchExportHtml';
import { ComponentTree } from '../components/ComponentTree';
import { DesignSidebar } from '../components/DesignSidebar';
import { CommandBar } from '../components/CommandBar';
import { DebugDock } from '../components/DebugDock';
import { ThemeToggle } from '../components/ThemeToggle';
import { ElementBreadcrumb } from '../components/ElementBreadcrumb';
import { AppIcon } from '../components/AppIcon';
import { CollapsibleSidePanel } from '../components/CollapsibleSidePanel';
import { DiffDrawer } from '../components/DiffDrawer';
import './WorkbenchView.css';

const PANEL_LEFT_KEY = 've_panel_left';
const PANEL_RIGHT_KEY = 've_panel_right';

function readPanelOpen(key: string, defaultOpen = true): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

export function WorkbenchView() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeSrc = useEditorStore((s) => s.iframeSrc);
  const projectName = useEditorStore((s) => s.projectName);
  const selected = useEditorStore((s) => s.selected);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editorMode = useEditorStore((s) => s.editorMode);
  const pendingCount = useEditorStore((s) => s.pendingChanges.length);
  const diffOpen = useEditorStore((s) => s.diffOpen);
  const openDiff = useEditorStore((s) => s.openDiff);
  const closeDiff = useEditorStore((s) => s.closeDiff);
  const consoleEntries = useEditorStore((s) => s.consoleEntries);
  const selectNode = useEditorStore((s) => s.selectNode);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const historyLength = useEditorStore((s) => s.history.length);
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex >= 0 && historyIndex < historyLength - 1;
  const disconnect = useEditorStore((s) => s.disconnect);
  const addConsoleEntry = useEditorStore((s) => s.addConsoleEntry);
  const selectedForEdit = useEditorStore((s) => s.selected);

  const [exporting, setExporting] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(() => readPanelOpen(PANEL_LEFT_KEY));
  const [rightPanelOpen, setRightPanelOpen] = useState(() => readPanelOpen(PANEL_RIGHT_KEY));
  const toggleLeftPanel = useCallback(() => {
    setLeftPanelOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(PANEL_LEFT_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(PANEL_RIGHT_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const errorCount = consoleEntries.filter((e) => e.level === 'error').length;

  const handleExportHtml = useCallback(async () => {
    setExporting(true);
    try {
      const raw = await requestExportHtml();
      const changes = useEditorStore.getState().pendingChanges;
      const html = patchExportedHtmlWithPendingChanges(raw, changes);
      const base = sanitizeFilename(projectName.replace(/\.html?$/i, ''));
      downloadTextFile(`${base}.html`, html);
      addConsoleEntry({
        id: `export-${Date.now()}`,
        level: 'info',
        message: `已导出 ${base}.html`,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      addConsoleEntry({
        id: `export-err-${Date.now()}`,
        level: 'error',
        message: `导出失败：${String(e)}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setExporting(false);
    }
  }, [projectName, addConsoleEntry]);

  const onLoad = useCallback(() => {
    if (iframeRef.current) {
      setIframeRef(iframeRef.current);
      scheduleRuntimeInit();
      setEditorMode(editorMode);
    }
  }, [editorMode, iframeSrc]);

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    setIframeRef(el);
    const sync = () => scheduleRuntimeInit();
    el.addEventListener('load', sync);
    try {
      if (el.contentDocument?.readyState === 'complete') sync();
    } catch {
      /* 跨域时无法读 contentDocument，依赖 onLoad */
    }
    return () => el.removeEventListener('load', sync);
  }, [iframeSrc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (diffOpen && e.key === 'Escape') {
        e.preventDefault();
        closeDiff();
        return;
      }
      if (
        e.key === 'Enter' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        selectedForEdit?.textEditable &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        startTextEdit(selectedForEdit.id);
        return;
      }
      if (e.key === 'Escape') selectNode(null);
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const snap = undo();
        if (snap !== null) restoreSnapshots(snap);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const snap = redo();
        if (snap !== null) restoreSnapshots(snap);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleExportHtml();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selectNode,
    undo,
    redo,
    historyIndex,
    historyLength,
    handleExportHtml,
    selectedForEdit,
    diffOpen,
    closeDiff,
  ]);

  return (
    <div className="workbench">
      <header className="workbench__header">
        <div className="workbench__brand">
          <AppIcon className="workbench__logo" size={22} />
          <span title={iframeSrc || undefined}>{projectName}</span>
        </div>
        <div className="workbench__actions">
          <ThemeToggle />
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={!canUndo}
            onClick={() => {
              const snap = undo();
              if (snap !== null) restoreSnapshots(snap);
            }}
          >
            撤销
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={!canRedo}
            onClick={() => {
              const snap = redo();
              if (snap !== null) restoreSnapshots(snap);
            }}
          >
            重做
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={pendingCount === 0}
            onClick={openDiff}
            title="并排预览源码变更并写入项目"
          >
            变更 Diff
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            disabled={exporting}
            onClick={() => void handleExportHtml()}
            title="导出当前编辑后的 HTML"
          >
            {exporting ? '导出中…' : '导出 HTML'}
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={disconnect} title="返回导入页">
            更换网页
          </button>
        </div>
      </header>

      {pendingCount > 0 && (
        <div className="workbench__pending" role="status">
          <span>
            {pendingCount} 项未保存变更（画布已预览；可「变更 Diff」写回源码或「导出 HTML」）
          </span>
          <button type="button" className="workbench__diff-toggle" onClick={openDiff}>
            查看 Diff
          </button>
        </div>
      )}

      <CommandBar />

      <div className="workbench__multi-hint">
        {selectedIds.length > 1 && (
          <span>已多选 {selectedIds.length} 个元素 — Ctrl+点击可增减选择</span>
        )}
        {editorMode === 'structure' && (
          <span className="workbench__mode-hint">
            结构模式：先点选卡片/区块，再拖动（会拖动当前选中整块）；仅可调整同级顺序
          </span>
        )}
        {editorMode === 'inspect' && (
          <span className="workbench__mode-hint">双击文字可就地编辑；选中后按 Enter 进入编辑</span>
        )}
      </div>

      <div className="workbench__body">
        <CollapsibleSidePanel
          side="left"
          title="图层"
          open={leftPanelOpen}
          onToggle={toggleLeftPanel}
        >
          <ComponentTree />
        </CollapsibleSidePanel>
        <main className="workbench__canvas">
          <iframe
            ref={iframeRef}
            title="预览画布"
            src={iframeSrc}
            key={iframeSrc}
            onLoad={onLoad}
            className="workbench__iframe"
          />
        </main>
        <CollapsibleSidePanel
          side="right"
          title="设计"
          open={rightPanelOpen}
          onToggle={toggleRightPanel}
        >
          <DesignSidebar />
        </CollapsibleSidePanel>
      </div>

      <footer className="workbench__footer">
        <ElementBreadcrumb />
        <DebugDock />
        <span className="workbench__status">
          {errorCount > 0 ? `${errorCount} 个错误` : '无错误'}
        </span>
      </footer>

      {diffOpen && <DiffDrawer />}
    </div>
  );
}
