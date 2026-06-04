import type { ReactNode } from 'react';
import './CollapsibleSidePanel.css';

interface CollapsibleSidePanelProps {
  side: 'left' | 'right';
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsibleSidePanel({
  side,
  title,
  open,
  onToggle,
  children,
}: CollapsibleSidePanelProps) {
  return (
    <aside
      className={`side-panel side-panel--${side} ${open ? 'side-panel--open' : 'side-panel--collapsed'}`}
    >
      <div className="side-panel__toolbar">
        <button
          type="button"
          className="side-panel__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `收起${title}` : `展开${title}`}
          title={open ? `收起${title}` : `展开${title}`}
        >
          <span className="side-panel__toggle-icon" aria-hidden />
        </button>
        {open && <span className="side-panel__title">{title}</span>}
      </div>
      {open ? (
        <div className="side-panel__body">{children}</div>
      ) : (
        <button
          type="button"
          className="side-panel__collapsed-hit"
          onClick={onToggle}
          aria-label={`展开${title}`}
          title={`展开${title}`}
        >
          <span className="side-panel__collapsed-label">{title}</span>
        </button>
      )}
    </aside>
  );
}
