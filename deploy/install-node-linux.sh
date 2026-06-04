#!/usr/bin/env bash
# 在 CentOS 8+ / RHEL 8+ / Rocky / Alma 上安装 Node.js 20（需 root）
# CentOS 7 请改用: deploy/install-node-el7.sh
# 用法: sudo bash deploy/install-node-linux.sh
set -e

if [ -f /etc/redhat-release ] && grep -qE 'release 7[^0-9]' /etc/redhat-release 2>/dev/null; then
  echo "检测到 CentOS/RHEL 7，NodeSource 20 无法安装（glibc 2.17）。" >&2
  echo "请执行: sudo bash deploy/install-node-el7.sh" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 或 sudo 运行" >&2
  exit 1
fi

if command -v dnf >/dev/null 2>&1; then
  PKG=dnf
elif command -v yum >/dev/null 2>&1; then
  PKG=yum
else
  echo "未找到 yum/dnf" >&2
  exit 1
fi

echo ">>> 安装 NodeSource Node.js 20.x ..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
$PKG install -y nodejs

echo ">>> 版本:"
node -v
npm -v
echo ">>> 完成。进入项目目录后执行: npm ci && bash scripts/start-production.sh"
