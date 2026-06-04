# 测试用 HTML

| 文件 | 说明 |
|------|------|
| [ve-feature-test.html](./ve-feature-test.html) | **全功能验收页**：Flex/Grid、样式、媒体、Props、文字、结构拖放、控制台与网络请求 |

## 使用

1. 根目录执行 `npm run build:runtime`（首次）与 `npm run dev`
2. 打开 http://localhost:5174
3. 连接页底部点击 **打开全功能演示**（或本地导入 `fixtures/ve-feature-test.html`）
4. 按页面底部「建议验收项」逐项点选验证

页面为自包含 HTML（内联样式 + 底部脚本），不依赖 `demo-app`。
