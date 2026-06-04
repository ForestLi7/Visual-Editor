import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { DomTreeNode } from '@ve/core';
import { useEditorStore } from '../store/editorStore';
import {
  selectNodeById,
  reorderNode,
  setEditorMode as setRuntimeMode,
  initRuntime,
} from '../bridge/iframeBridge';
import './ComponentTree.css';

/** 子级缩进由 CSS .tree-node__children 控制，避免深层级把标签挤出可视区 */

const TAG_ICONS: Record<string, string> = {
  main: '◫',
  section: '▤',
  article: '▢',
  header: '▭',
  footer: '▭',
  div: '◇',
  span: '·',
  p: '¶',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  button: '⏺',
  a: '🔗',
  img: '▣',
  ul: '≡',
  ol: '≡',
  li: '•',
  nav: '☰',
  form: '✎',
  input: '▭',
};

function tagIcon(tag: string): string {
  return TAG_ICONS[tag] ?? tag.slice(0, 2).toUpperCase();
}

function countNodes(nodes: DomTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function findAncestorIds(nodes: DomTreeNode[], targetId: string, acc: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return acc;
    const found = findAncestorIds(n.children, targetId, [...acc, n.id]);
    if (found) return found;
  }
  return null;
}

function filterTree(nodes: DomTreeNode[], query: string): DomTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const walk = (node: DomTreeNode): DomTreeNode | null => {
    const selfMatch =
      node.tag.includes(q) ||
      node.label.toLowerCase().includes(q) ||
      node.id.toLowerCase().includes(q);
    const children = node.children.map(walk).filter((c): c is DomTreeNode => c !== null);
    if (selfMatch || children.length > 0) {
      return { ...node, children };
    }
    return null;
  };

  return nodes.map(walk).filter((n): n is DomTreeNode => n !== null);
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden className="tree-node__chevron-svg">
      {expanded ? (
        <path d="M3.5 5.5 L8 9.5 L12.5 5.5 Z" fill="currentColor" />
      ) : (
        <path d="M5.5 3.5 L9.5 8 L5.5 12.5 Z" fill="currentColor" />
      )}
    </svg>
  );
}

interface TreeNodeProps {
  node: DomTreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggleCollapse: (id: string) => void;
  searchActive: boolean;
  isLast: boolean;
}

function TreeNode({
  node,
  depth,
  collapsed,
  onToggleCollapse,
  searchActive,
  isLast,
}: TreeNodeProps) {
  const selected = useEditorStore((s) => s.selected);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editorMode = useEditorStore((s) => s.editorMode);
  const isActive = selectedIds.includes(node.id) || selected?.id === node.id;
  const isPrimary = selected?.id === node.id;
  const hasChildren = node.children.length > 0;
  const isCollapsed = !searchActive && collapsed.has(node.id);
  const isExpanded = hasChildren && !isCollapsed;
  const compHint =
    node.label !== node.tag ? node.label : undefined;

  const onDragStart = (e: React.DragEvent) => {
    if (editorMode !== 'structure') return;
    e.stopPropagation();
    e.dataTransfer.setData('text/ve-tree-id', node.id);
    e.dataTransfer.setData('text/ve-id', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    if (editorMode !== 'structure') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent) => {
    if (editorMode !== 'structure') return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId =
      e.dataTransfer.getData('text/ve-tree-id') || e.dataTransfer.getData('text/ve-id');
    if (!sourceId || sourceId === node.id) return;
    const row = e.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    reorderNode(sourceId, node.id, before ? 'before' : 'after');
  };

  const toggleExpand = () => {
    if (hasChildren) onToggleCollapse(node.id);
  };

  return (
    <div className={`tree-node ${isLast ? 'tree-node--last' : ''}`} data-depth={depth}>
      <div
        className={`tree-node__row ${isActive ? 'tree-node__row--active' : ''} ${isPrimary ? 'tree-node__row--primary' : ''} ${editorMode === 'structure' ? 'tree-node__row--structure' : ''}`}
        data-node-id={node.id}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isActive}
      >
        <button
          type="button"
          className={`tree-node__chevron ${hasChildren ? '' : 'tree-node__chevron--leaf'}`}
          aria-label={isCollapsed ? '展开子节点' : '折叠子节点'}
          tabIndex={hasChildren ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand();
          }}
        >
          {hasChildren ? <ChevronIcon expanded={isExpanded} /> : null}
        </button>

        <button
          type="button"
          className="tree-node__main"
          draggable={editorMode === 'structure'}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => selectNodeById(node.id)}
          onDoubleClick={(e) => {
            e.preventDefault();
            toggleExpand();
          }}
          title={compHint ? `${node.tag} (${compHint}) · ${node.id}` : `${node.tag} · ${node.id}`}
        >
          <span className={`tree-node__icon tree-node__icon--${node.tag}`} aria-hidden>
            {tagIcon(node.tag)}
          </span>
          <span className="tree-node__name">{node.tag}</span>
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div className="tree-node__children" role="group">
          {node.children.map((c, i) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              searchActive={searchActive}
              isLast={i === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ComponentTree() {
  const tree = useEditorStore((s) => s.tree);
  const selected = useEditorStore((s) => s.selected);
  const editorMode = useEditorStore((s) => s.editorMode);
  const setEditorMode = useEditorStore((s) => s.setEditorMode);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const searchActive = search.trim().length > 0;
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search]);
  const nodeCount = useMemo(() => countNodes(tree), [tree]);

  const onToggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selected?.id || tree.length === 0) return;
    const ancestors = findAncestorIds(tree, selected.id);
    if (!ancestors?.length) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      ancestors.forEach((id) => {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selected?.id, tree]);

  useEffect(() => {
    if (!selected?.id || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-node-id="${selected.id}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected?.id, tree, collapsed]);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const ids = new Set<string>();
    const walk = (nodes: DomTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.children.length) ids.add(n.id);
        walk(n.children);
      });
    };
    walk(tree);
    setCollapsed(ids);
  };

  const toggleStructureMode = () => {
    const next = editorMode === 'structure' ? 'inspect' : 'structure';
    setEditorMode(next);
    setRuntimeMode(next);
  };

  return (
    <div className="component-tree">
      <header className="component-tree__header">
        <div className="component-tree__title-row">
          <span className="component-tree__title">图层</span>
          {nodeCount > 0 && <span className="component-tree__count">{nodeCount}</span>}
        </div>
        <button
          type="button"
          className={`component-tree__mode ${editorMode === 'structure' ? 'component-tree__mode--on' : ''}`}
          onClick={toggleStructureMode}
          title="拖放重排同级元素"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M2 5h12M2 8h12M2 11h8"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            <path d="M12 10l2 1.5-2 1.5" fill="currentColor" />
          </svg>
          <span>{editorMode === 'structure' ? '结构中' : '结构'}</span>
        </button>
      </header>

      <div className="component-tree__search">
        <svg className="component-tree__search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="筛选节点…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="component-tree__search-clear"
            onClick={() => setSearch('')}
            aria-label="清除"
          >
            ×
          </button>
        )}
      </div>

      {tree.length > 0 && (
        <div className="component-tree__actions">
          <button type="button" onClick={expandAll}>
            全部展开
          </button>
          <span className="component-tree__actions-sep" />
          <button type="button" onClick={collapseAll}>
            全部折叠
          </button>
        </div>
      )}

      <div className="component-tree__scroll" ref={scrollRef}>
        {tree.length === 0 ? (
          <div className="component-tree__empty">
            <div className="component-tree__empty-icon" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <p>等待页面结构</p>
            <span>导入页面加载后，DOM 层级会显示在这里；若为空请点击重新同步。</span>
            <button type="button" className="component-tree__sync" onClick={() => initRuntime()}>
              重新同步
            </button>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="component-tree__empty component-tree__empty--compact">
            <p>无匹配节点</p>
            <button type="button" onClick={() => setSearch('')}>
              清除筛选
            </button>
          </div>
        ) : (
          <div className="component-tree__list" role="tree">
            {filteredTree.map((n, i) => (
              <TreeNode
                key={n.id}
                node={n}
                depth={0}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                searchActive={searchActive}
                isLast={i === filteredTree.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
