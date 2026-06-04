import { useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';
import { selectNodeById } from '../bridge/iframeBridge';
import { parseElementPath } from '../utils/parseElementPath';
import './ElementBreadcrumb.css';

export function ElementBreadcrumb() {
  const selected = useEditorStore((s) => s.selected);
  const tree = useEditorStore((s) => s.tree);

  const bodyId = tree[0]?.id;

  const crumbs = useMemo(() => {
    if (!selected?.path) return [];
    return parseElementPath(selected.path, bodyId);
  }, [selected?.path, bodyId]);

  if (!selected) {
    return <span className="element-breadcrumb element-breadcrumb--empty">未选中元素 — 点击画布开始编辑</span>;
  }

  return (
    <nav className="element-breadcrumb" aria-label="元素层级">
      {crumbs.map((crumb, index) => {
        const isActive = crumb.nodeId === selected.id;
        const clickable = Boolean(crumb.nodeId);

        return (
          <span key={`${crumb.nodeId ?? crumb.label}-${index}`} className="element-breadcrumb__segment">
            {index > 0 && <span className="element-breadcrumb__sep" aria-hidden />}
            <button
              type="button"
              className={`element-breadcrumb__crumb ${isActive ? 'element-breadcrumb__crumb--active' : ''}`}
              disabled={!clickable}
              title={crumb.nodeId ?? crumb.label}
              onClick={() => crumb.nodeId && selectNodeById(crumb.nodeId)}
            >
              {crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
