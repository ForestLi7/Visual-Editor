### 打包发布到测试环境

```powershell
cd E:\2026年工作\2026年5月\可视化编辑器
npm run docker:pack:cn
```

完成后会有文件：
release\visual-editor-docker.tar

上传到服务器，在服务器执行：

```powershell
cd /ops/visual-editor   # 你的目录

docker rm -f visual-editor

docker run -d \
  --name visual-editor \
  --init \
  --restart unless-stopped \
  --security-opt seccomp=unconfined \
  --ulimit nproc=65535:65535 \
  --ulimit nofile=65535:65535 \
  -p 127.0.0.1:5174:5174 \
  -e VE_BASE_PATH=/visual-editor/ \
  visual-editor:latest
```

等约 10 秒再测：

```powershell
docker ps
curl http://127.0.0.1:5174/visual-editor/api/health
```