import { useEditorStore } from '../store/editorStore';
import { setTheme as postTheme } from '../bridge/iframeBridge';
import type { ThemeMode } from '@ve/core';

export function ThemeToggle() {
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const importId = useEditorStore((s) => s.importId);

  const cycle = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // 导入/粘贴的 HTML 使用页面自有配色，不随 Shell 改 data-theme
    if (!importId) {
      postTheme(next);
    }
  };

  return (
    <button
      type="button"
      className="btn btn--sm btn--ghost theme-toggle"
      onClick={cycle}
      title={
        importId
          ? '切换编辑器界面主题（不改变预览页内颜色）'
          : '切换编辑器与预览的浅色/深色主题'
      }
    >
      {theme === 'dark' ? '☀ 浅色' : '☾ 深色'}
    </button>
  );
}
