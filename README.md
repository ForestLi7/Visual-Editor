# 可视化编辑器 (Visual Editor)

导入 HTML 后在浏览器中点选编辑，改样式、文字与媒体，**导出 HTML** 交付。

## 文档

**入口：[docs/README.md](./docs/README.md)**

| 文档 | 说明 |
|------|------|
| [产品宣传与分享](./docs/产品宣传与分享.md) | 对内演示、一页介绍（**分享首选**） |
| [产品需求文档](./docs/产品需求文档.md) | PRD、用户故事、验收 |
| [交互原型](./docs/交互原型.md) | 线框、IA、交互流 |
| [技术方案](./docs/技术方案.md) | 架构、协议、模块对照 |
| [用户手册](./docs/用户手册.md) | 安装、使用、部署、排错 |

## 快速开始

```bash
npm install
npm run build:runtime
npm run dev
```

浏览器 **http://localhost:5174** → 导入 HTML → 编辑 → **导出 HTML**（`Ctrl+S`）。

全功能测试：连接页「打开全功能演示」或 [fixtures/ve-feature-test.html](./fixtures/ve-feature-test.html)。

## 项目结构

```
packages/core, runtime, nlp, code-engine
editor/              # Shell (5174)
demo-app/            # 可选示例
vscode-extension/
```

## 许可证

Private / 内部项目
