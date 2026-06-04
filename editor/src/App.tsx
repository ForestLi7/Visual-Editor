import { useEffect } from 'react';
import { useEditorStore } from './store/editorStore';
import { setupGlobalBridge } from './bridge/setupBridge';
import { applyEditorTheme } from './utils/theme';
import { ConnectView } from './views/ConnectView';
import { WorkbenchView } from './views/WorkbenchView';

export default function App() {
  const connected = useEditorStore((s) => s.connected);
  const theme = useEditorStore((s) => s.theme);

  useEffect(() => setupGlobalBridge(), []);

  useEffect(() => {
    applyEditorTheme(theme);
  }, [theme]);

  return connected ? <WorkbenchView /> : <ConnectView />;
}
