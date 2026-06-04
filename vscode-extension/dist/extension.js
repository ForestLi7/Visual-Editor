"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const DEFAULT_URL = 'http://localhost:5174';
const DEMO_HINT = '① 在项目根目录终端执行: npm run dev:all\n② 等终端出现 localhost:5174 后，若面板空白请点顶部链接或重新执行本命令\n③ 连接页选「使用内置演示应用」\n\n不会用请看: docs/VS-CODE-使用说明.md';
function getEditorUrl() {
    const cfg = vscode.workspace.getConfiguration('visualEditor');
    const url = (cfg.get('serverUrl') ?? DEFAULT_URL).trim();
    return url.replace(/\/$/, '');
}
function activate(context) {
    const openPanel = () => {
        const url = getEditorUrl();
        const panel = vscode.window.createWebviewPanel('visualEditor', 'Visual Editor', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        panel.webview.html = getWebviewHtml(url);
    };
    context.subscriptions.push(vscode.commands.registerCommand('visualEditor.open', () => {
        openPanel();
        vscode.window.showInformationMessage(DEMO_HINT);
    }), vscode.commands.registerCommand('visualEditor.openDemo', async () => {
        const term = vscode.window.createTerminal({
            name: 'Visual Editor Dev',
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        });
        term.sendText('npm run dev:all');
        term.show();
        await new Promise((r) => setTimeout(r, 4000));
        openPanel();
    }));
}
function getWebviewHtml(url) {
    let frameOrigin = url;
    try {
        frameOrigin = new URL(url).origin;
    }
    catch {
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
function deactivate() { }
//# sourceMappingURL=extension.js.map