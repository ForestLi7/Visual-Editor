#!/usr/bin/env bash
# 在【测试服务器 node2】上执行，无需 npm / Node
# 前提：已安装 Docker（见下方「装 Docker」）
set -e

IMAGE="visual-editor:latest"
NAME="visual-editor"
PORT="${PORT:-5174}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker。CentOS 7 请先执行（root）："
  echo "  yum install -y docker"
  echo "  systemctl enable --now docker"
  exit 1
fi

if [ -f visual-editor-docker.tar ]; then
  TAR_FILE="visual-editor-docker.tar"
elif [ -f visual-editor-docker.tar.gz ]; then
  TAR_FILE="visual-editor-docker.tar.gz"
else
  echo "请把 visual-editor-docker.tar 或 .tar.gz 放在当前目录: $(pwd)" >&2
  exit 1
fi

echo ">>> 加载镜像 (${TAR_FILE})..."
case "$TAR_FILE" in
  *.tar.gz) gunzip -c "$TAR_FILE" | docker load ;;
  *) docker load -i "$TAR_FILE" ;;
esac

docker rm -f "$NAME" 2>/dev/null || true

echo ">>> 启动容器（端口 ${PORT}）..."
# CentOS 7 自带 Docker 1.13 + 默认 seccomp 常导致 Node 20 无法 uv_thread_create（退出码 139）
if ! docker run -d \
  --name "$NAME" \
  --init \
  --restart unless-stopped \
  --security-opt seccomp=unconfined \
  --ulimit nproc=65535:65535 \
  --ulimit nofile=65535:65535 \
  -p "127.0.0.1:${PORT}:5174" \
  -e VE_BASE_PATH=/visual-editor/ \
  "$IMAGE"; then
  echo "容器启动失败，最近日志:" >&2
  docker logs "$NAME" 2>&1 | tail -n 40 >&2 || true
  exit 1
fi

echo ""
echo ">>> 等待服务就绪（最多 30s）..."
ok=0
for i in $(seq 1 15); do
  if curl -sf "http://127.0.0.1:${PORT}/visual-editor/api/health" >/dev/null; then
    ok=1
    break
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
    echo "容器已退出，日志如下:" >&2
    docker logs "$NAME" 2>&1 | tail -n 50 >&2
    exit 1
  fi
  sleep 2
done

echo ""
if [ "$ok" = 1 ]; then
  curl -sf "http://127.0.0.1:${PORT}/visual-editor/api/health" && echo ""
  echo ">>> 部署成功"
else
  echo ">>> 健康检查失败，请执行排查:" >&2
  echo "    docker ps -a" >&2
  echo "    docker logs ${NAME}" >&2
  echo "    ss -lntp | grep ${PORT}" >&2
  exit 1
fi
echo ""
echo ">>> 访问: http://127.0.0.1:${PORT}/visual-editor/"
echo ">>> nginx 反代到: http://127.0.0.1:${PORT}/visual-editor/"
echo ">>> 查看日志: docker logs -f ${NAME}"
