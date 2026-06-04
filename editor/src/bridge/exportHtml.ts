import type { RuntimeToShellMessage } from '@ve/core';
import { postToRuntime } from './iframeBridge';

let exportWaiter: {
  resolve: (html: string) => void;
  reject: (err: Error) => void;
} | null = null;

export function handleExportHtmlMessage(msg: RuntimeToShellMessage): boolean {
  if (msg.type !== 'VE_HTML_EXPORT') return false;
  exportWaiter?.resolve(msg.html);
  exportWaiter = null;
  return true;
}

export function requestExportHtml(timeoutMs = 8000): Promise<string> {
  if (exportWaiter) {
    return Promise.reject(new Error('已有导出任务进行中'));
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      exportWaiter = null;
      reject(new Error('导出超时，请确认页面已加载 Inspector'));
    }, timeoutMs);

    exportWaiter = {
      resolve: (html) => {
        window.clearTimeout(timer);
        resolve(html);
      },
      reject: (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    };

    postToRuntime({ type: 'VE_EXPORT_HTML' });
  });
}
