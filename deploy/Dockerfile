# 在开发机（已安装 Docker）构建，服务器无需 Node.js
# 构建: docker build -f deploy/Dockerfile -t visual-editor:latest .
# 国内拉不动 hub 时: npm run docker:pack:cn
ARG NODE_IMAGE=node:20-bookworm-slim
ARG NPM_REGISTRY=
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json .visualeditorrc.json ./
COPY packages ./packages
COPY editor ./editor
COPY fixtures ./fixtures
COPY scripts/build-runtime.mjs ./scripts/build-runtime.mjs

ENV VE_BASE_PATH=/visual-editor/
ENV PORT=5174

RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
  && npm ci \
  && node scripts/build-runtime.mjs \
  && npm run build -w editor

EXPOSE 5174

CMD ["npm", "run", "preview", "-w", "editor", "--", "--host", "0.0.0.0", "--port", "5174"]
