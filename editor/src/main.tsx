import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyEditorTheme, readStoredTheme } from './utils/theme';
import './styles/global.css';

applyEditorTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
