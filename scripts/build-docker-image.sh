#!/usr/bin/env bash
# 在【你的电脑】上执行：打出 Docker 镜像并导出为 tar，上传到测试服务器即可
# 要求：本机已安装 Docker Desktop / Docker Engine
set -e
cd "$(dirname "$0")/.."

IMAGE="${VE_DOCKER_IMAGE:-visual-editor:latest}"
OUT_DIR="${VE_DOCKER_OUT:-release}"
ARCHIVE="${OUT_DIR}/visual-editor-docker.tar.gz"

echo ">>> 构建镜像 ${IMAGE}（首次约 3～8 分钟）..."
docker build -f deploy/Dockerfile -t "${IMAGE}" .

mkdir -p "${OUT_DIR}"
echo ">>> 导出 ${ARCHIVE} ..."
docker save "${IMAGE}" | gzip > "${ARCHIVE}"

SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo ""
echo "完成。请把下面文件上传到服务器 node2："
echo "  ${ARCHIVE}  (${SIZE})"
echo "  deploy/run-on-server.sh"
echo ""
echo "服务器上执行："
echo "  bash run-on-server.sh"
