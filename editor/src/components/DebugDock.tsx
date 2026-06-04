import { useEditorStore, type DebugTab } from '../store/editorStore';
import { ConsolePanel } from './ConsolePanel';
import { NetworkPanel } from './NetworkPanel';
import './DebugDock.css';

function ConsoleBody() {
  const entries = useEditorStore((s) => s.consoleEntries);
  const errors = entries.filter((e) => e.level === 'error').length;
  const warns = entries.filter((e) => e.level === 'warn').length;

  return (
    <div className="debug-dock__body">
      {entries.length === 0 ? (
        <p className="debug-dock__empty">暂无日志（目标页 console 输出会同步至此）</p>
      ) : (
        <ul className="debug-dock__console-list">
          {entries.map((e) => (
            <li key={e.id} className={`debug-dock__line debug-dock__line--${e.level}`}>
              <time>{new Date(e.timestamp).toLocaleTimeString()}</time>
              <span>[{e.level}]</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
      {(errors > 0 || warns > 0) && (
        <span className="debug-dock__console-meta">
          {errors > 0 && `${errors} 错误`}
          {warns > 0 && ` ${warns} 警告`}
        </span>
      )}
    </div>
  );
}

export function DebugDock() {
  const open = useEditorStore((s) => s.consoleOpen);
  const tab = useEditorStore((s) => s.debugTab);
  const setDebugTab = useEditorStore((s) => s.setDebugTab);
  const toggle = useEditorStore((s) => s.toggleConsole);
  const consoleEntries = useEditorStore((s) => s.consoleEntries);
  const networkEntries = useEditorStore((s) => s.networkEntries);

  const errors = consoleEntries.filter((e) => e.level === 'error').length;
  const netFailed = networkEntries.filter((e) => !e.ok).length;

  const setTab = (t: DebugTab) => {
    setDebugTab(t);
    if (!open) toggle();
  };

  return (
    <div className={`debug-dock ${open ? 'debug-dock--open' : ''}`}>
      <div className="debug-dock__tabs">
        <button
          type="button"
          className={`debug-dock__tab ${tab === 'console' ? 'debug-dock__tab--active' : ''}`}
          onClick={() => setTab('console')}
        >
          控制台
          {errors > 0 && <span className="debug-dock__badge debug-dock__badge--err">{errors}</span>}
        </button>
        <button
          type="button"
          className={`debug-dock__tab ${tab === 'network' ? 'debug-dock__tab--active' : ''}`}
          onClick={() => setTab('network')}
        >
          网络
          {netFailed > 0 && (
            <span className="debug-dock__badge debug-dock__badge--err">{netFailed}</span>
          )}
          {netFailed === 0 && networkEntries.length > 0 && (
            <span className="debug-dock__badge">{networkEntries.length}</span>
          )}
        </button>
        <button type="button" className="debug-dock__toggle" onClick={toggle}>
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <div className="debug-dock__panel">
          {tab === 'console' ? <ConsoleBody /> : <NetworkPanel />}
        </div>
      )}
    </div>
  );
}
