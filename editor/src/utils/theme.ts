import type { ThemeMode } from '@ve/core';

const STORAGE_KEY = 've-editor-theme';

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

/** 将主题应用到编辑器外壳（html[data-theme]） */
export function applyEditorTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
