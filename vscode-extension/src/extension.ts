import * as vscode from 'vscode';

const DEFAULT_URL = 'http://localhost:5174';
const DEMO_HINT =
  '① 在项目根目录终端执行: npm run dev:all\n② 等终端出现 localhost:5174 后，若面板空白请点顶部链接或重新执行本命令\n③ 连接页选「使用内置演示应用」\n\n不会用请看: docs/VS-CODE-使用说明.md';

function getEditorUrl(): string {
  const cfg = vscode.workspace.getConfiguration('visualEditor');
  const url = (cfg.get<string>('serverUrl') ?? DEFAULT_URL).trim();
  return url.replace(/\/$/, '');
}

export function activate(context: vscode.ExtensionContext) {
  const openPanel = () => {
    const url = getEditorUrl();
    const panel = vscode.window.createWebviewPanel(
      'visualEditor',
      'Visual Editor',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = getWebviewHtml(url);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('visualEditor.open', () => {
      openPanel();
      vscode.window.showInformationMessage(DEMO_HINT);
    }),
    vscode.commands.registerCommand('visualEditor.openDemo', async () => {
      const term = vscode.window.createTerminal({
        name: 'Visual Editor Dev',
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      });
      term.sendText('npm run dev:all');
      term.show();
      await new Promise((r) => setTimeout(r, 4000));
      openPanel();
    })
  );
}

function getWebviewHtml(url: string): string {
  let frameOrigin = url;
  try {
    frameOrigin = new URL(url).origin;
  } catch {    
    frameOrigin = 'http://localhost:5174';
  }
  const csp = `default-src 'none'; frame-src ${frameOrigin} http://localhost:* https://localhost:*; style-src 'unsafe-inline'`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; background: #0d0f12; }
    iframe { width: 100%; height: 100%; border: none; }
    .bar { padding: 6px 12px; font-family: system-ui; font-size: 12px; color: #8b929a; background: #14171c; }
    a { color: #3ecf8e; }
  </style>
</head>
<body>
  <div class="bar">Visual Editor · ${url} · <a href="${url}">浏览器打开</a></div>
  <iframe src="${url}" title="Visual Editor"></iframe>
</body>
</html>`;
}

export function deactivate() {}
