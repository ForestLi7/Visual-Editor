#!/usr/bin/env bash
# 测试环境启动 Visual Editor（需先 npm ci）
# 请用 bash 执行：bash scripts/start-production.sh（不要用 sh）
set -e
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 常见 Node 安装路径（nvm / NodeSource）
if ! command -v npm >/dev/null 2>&1; then
  for f in \
    "$HOME/.nvm/nvm.sh" \
    "/usr/local/nvm/nvm.sh" \
    "/etc/profile.d/nodejs.sh"
  do
    if [ -f "$f" ]; then
      # shellcheck disable=SC1090
      . "$f"
      break
    fi
  done
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "错误: 未找到 npm。请先安装 Node.js 20+，见 docs/部署说明.md「安装 Node.js」" >&2
  echo "  验证: node -v && npm -v" >&2
  exit 127
fi

if [ -f deploy/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . deploy/.env
  set +a
fi

VE_BASE_PATH="${VE_BASE_PATH:-/visual-editor/}"
PORT="${PORT:-5174}"
export VE_BASE_PATH PORT

if [ ! -d editor/dist ]; then
  echo "缺少 editor/dist，请在本机执行 npm run pack" >&2
  exit 1
fi

if [ ! -f editor/public/ve-runtime.js ]; then
  echo "缺少 editor/public/ve-runtime.js" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "缺少 node_modules，请先执行: npm ci" >&2
  exit 1
fi

echo "Visual Editor → http://0.0.0.0:${PORT} (base: ${VE_BASE_PATH})"
echo "  局域网示例: http://127.0.0.1:${PORT}${VE_BASE_PATH%/}/"
exec npm run preview -w editor -- --host 0.0.0.0 --port "${PORT}"
