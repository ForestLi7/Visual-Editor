#!/usr/bin/env bash
# CentOS 7 / RHEL 7：系统 glibc 2.17，无法 yum 安装 NodeSource 20
# 使用 nvm 从源码编译 Node 20（约 10～20 分钟，需 root 装编译依赖）
#
# 用法: sudo bash deploy/install-node-el7.sh
# 装完后用普通用户: source ~/.nvm/nvm.sh && node -v
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 或 sudo 运行（仅安装系统依赖；nvm 装到执行用户家目录）" >&2
  exit 1
fi

echo ">>> 安装编译依赖..."
yum groupinstall -y "Development Tools" || yum install -y gcc gcc-c++ make
yum install -y git curl openssl-devel

TARGET_USER="${SUDO_USER:-${USER}}"
TARGET_HOME="$(eval echo "~${TARGET_USER}")"

if [ ! -d "$TARGET_HOME" ]; then
  echo "无法确定用户目录: $TARGET_HOME" >&2
  exit 1
fi

echo ">>> 为用户 ${TARGET_USER} 安装 nvm..."
export NVM_DIR="${TARGET_HOME}/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  sudo -u "$TARGET_USER" bash -c 'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
fi

echo ">>> 从源码编译安装 Node 20（-s），请耐心等待..."
sudo -u "$TARGET_USER" bash -lc '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install -s 20
  nvm alias default 20
  node -v
  npm -v
'

echo ""
echo ">>> 完成。以后登录 SSH 后先执行:"
echo "    source ~/.nvm/nvm.sh"
echo "    cd /path/to/visual-editor-release && npm ci"
echo "    bash scripts/start-production.sh"
echo ""
echo "或写入 ~/.bashrc:"
echo '    export NVM_DIR="$HOME/.nvm"'
echo '    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
