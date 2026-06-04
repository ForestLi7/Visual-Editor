import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/** 独立打开 demo 时加载 inspector（编辑器仅支持 HTML 导入，不连接本地 dev 项目） */
if (import.meta.env.DEV && window.parent === window) {
  void import('../../packages/runtime/src/runtime.ts').catch((e) => {
    console.error('[visual-editor] runtime load failed', e);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
