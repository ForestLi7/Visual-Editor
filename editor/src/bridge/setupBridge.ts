import type { RuntimeToShellMessage } from '@ve/core';
import { useEditorStore } from '../store/editorStore';
import { handleExportHtmlMessage } from './exportHtml';
import { initBridgeListener, initRuntime, onRuntimeMessage } from './iframeBridge';

let listenerAttached = false;

/** 多次尝试向 iframe 发送 VE_INIT（本地 HTML 加载很快，需覆盖竞态） */
export function scheduleRuntimeInit() {
  const delays = [0, 80, 200, 500, 1000, 2000, 4000, 8000, 12000];
  delays.forEach((ms) => {
    setTimeout(() => initRuntime(), ms);
  });
}

function attachRuntimeHandler() {
  onRuntimeMessage((msg: RuntimeToShellMessage) => {
    if (handleExportHtmlMessage(msg)) return;

    const state = useEditorStore.getState();
    switch (msg.type) {
      case 'VE_READY':
      case 'VE_TREE_UPDATED':
        state.setTree(msg.tree);
        break;
      case 'VE_SELECT':
        state.selectNode(msg.node, msg.multi);
        break;
      case 'VE_TEXT_CHANGED': {
        const sel = state.selected;
        state.pushTextChange(msg.nodeId, msg.text, msg.previousText, sel ?? { nodeId: msg.nodeId });
        state.updateSelectedText(msg.text);
        break;
      }
      case 'VE_CONSOLE':
        state.addConsoleEntry(msg.entry);
        break;
      case 'VE_NETWORK':
        state.addNetworkEntry(msg.entry);
        break;
      case 'VE_NETWORK_BATCH':
        state.addNetworkBatch(msg.entries);
        break;
      case 'VE_THEME':
        state.setTheme(msg.theme);
        break;
      case 'VE_REORDERED':
        state.pushReorderChange(msg.parentId, msg.childIds);
        break;
      case 'VE_RUNTIME_LOADED':
        scheduleRuntimeInit();
        break;
      case 'VE_RUNTIME_ERROR':
        state.addConsoleEntry({
          id: `ve-err-${Date.now()}`,
          level: 'error',
          message: msg.detail ?? 'Inspector 脚本加载失败，请执行 npm run build:runtime',
          timestamp: new Date().toISOString(),
        });
        break;
    }
  });
}

export function setupGlobalBridge(): () => void {
  attachRuntimeHandler();

  if (!listenerAttached) {
    listenerAttached = true;
    initBridgeListener();
  }

  return () => undefined;
}
