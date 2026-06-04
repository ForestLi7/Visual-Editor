import { useEditorStore } from '../store/editorStore';
import './ConsolePanel.css';

export function ConsolePanel() {
  const entries = useEditorStore((s) => s.consoleEntries);
  const open = useEditorStore((s) => s.consoleOpen);
  const toggle = useEditorStore((s) => s.toggleConsole);

  const errors = entries.filter((e) => e.level === 'error').length;
  const warns = entries.filter((e) => e.level === 'warn').length;

  return (
    <div className={`console-panel ${open ? 'console-panel--open' : ''}`}>
      <button type="button" className="console-panel__toggle" onClick={toggle}>
        控制台
        {errors > 0 && <span className="console-panel__badge console-panel__badge--err">{errors}</span>}
        {warns > 0 && <span className="console-panel__badge console-panel__badge--warn">{warns}</span>}
        {!errors && !warns && <span className="console-panel__badge"> {entries.length}</span>}
      </button>
      {open && (
        <div className="console-panel__body">
          {entries.length === 0 ? (
            <p className="console-panel__empty">暂无日志（目标页 console 输出会同步至此）</p>
          ) : (
            <ul>
              {entries.map((e) => (
                <li key={e.id} className={`console-line console-line--${e.level}`}>
                  <time>{new Date(e.timestamp).toLocaleTimeString()}</time>
                  <span>[{e.level}]</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
