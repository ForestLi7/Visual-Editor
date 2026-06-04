/**
 * 构建 Docker 镜像并导出（Windows / macOS / Linux 通用）
 * 用法: npm run docker:pack
 */
import { execSync } from 'child_process';
import { mkdirSync, existsSync, statSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const image = process.env.VE_DOCKER_IMAGE || 'visual-editor:latest';
const useCn =
  process.argv.includes('--cn') ||
  process.env.VE_DOCKER_USE_CN_MIRROR === '1' ||
  process.env.VE_DOCKER_USE_CN_MIRROR === 'true';
/** DaoCloud 等镜像站上的 library/node */
const CN_NODE_IMAGE = 'docker.m.daocloud.io/library/node:20-bookworm-slim';
const CN_NPM_REGISTRY = 'https://registry.npmmirror.com';
const nodeImage = process.env.VE_DOCKER_BASE_IMAGE || (useCn ? CN_NODE_IMAGE : 'node:20-bookworm-slim');
const npmRegistry = process.env.VE_DOCKER_NPM_REGISTRY || (useCn ? CN_NPM_REGISTRY : '');
const outDir = join(root, 'release');
const tarPath = join(outDir, 'visual-editor-docker.tar');
const archiveGz = join(outDir, 'visual-editor-docker.tar.gz');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, shell: true });
}

function checkDocker() {
  try {
    execSync('docker version', { stdio: 'pipe', shell: true, encoding: 'utf8' });
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '') + String(e.message || '');
    const hasClient = /Version:\s*\d/i.test(out) || out.includes('Client:');
    console.error('\n--- Docker 不可用，无法执行 docker:pack ---\n');
    if (hasClient) {
      console.error('已检测到 docker 客户端，但引擎（daemon）未运行。');
      console.error('常见原因: Docker Desktop 未启动，或提示 "unable to start"。\n');
      console.error('请在本机:');
      console.error('  1. 打开「Docker Desktop」，等待左下角变为 Running / 引擎已启动');
      console.error('  2. PowerShell 执行: docker version  （Server 段应有版本号）');
      console.error('  3. 再执行: npm run docker:pack\n');
      console.error('若 Desktop 无法启动: 设置 → 资源/WSL → 确认 WSL2 正常；或重启电脑后再开 Desktop。');
    } else {
      console.error('未找到 docker 命令。请安装 Docker Desktop 并加入 PATH 后重试。');
    }
    console.error('\n无需 Docker 的替代: npm run pack');
    console.error('  → 产出 release/visual-editor-release.zip，服务器需 Node 20+ 与 npm ci\n');
    if (out.trim()) console.error('原始输出:\n' + out.trim().slice(0, 800) + '\n');
    process.exit(1);
  }
}

function hintRegistryTimeout() {
  console.error('\n--- 拉取基础镜像失败（多为无法访问 Docker Hub）---\n');
  console.error('可任选其一:');
  console.error('  1. 国内镜像构建:  npm run docker:pack:cn');
  console.error('  2. 手动指定基础镜像:');
  console.error('     $env:VE_DOCKER_BASE_IMAGE="docker.m.daocloud.io/library/node:20-bookworm-slim"');
  console.error('     npm run docker:pack');
  console.error('  3. Docker Desktop → Settings → Docker Engine，合并 deploy/docker-daemon-mirror.example.json');
  console.error('     保存并重启 Desktop 后，再 npm run docker:pack');
  console.error('\n或不用 Docker: npm run pack\n');
}

checkDocker();
mkdirSync(outDir, { recursive: true });

console.log(`\n>>> 构建镜像 ${image}（首次约 3～8 分钟）...`);
console.log(`    基础镜像: ${nodeImage}`);
if (npmRegistry) console.log(`    npm 源: ${npmRegistry}`);
console.log('');

const buildArgs = [`NODE_IMAGE=${nodeImage}`];
if (npmRegistry) buildArgs.push(`NPM_REGISTRY=${npmRegistry}`);
const buildArgFlags = buildArgs.map((a) => `--build-arg ${a}`).join(' ');

try {
  run(`docker build ${buildArgFlags} -f deploy/Dockerfile -t ${image} .`);
} catch (e) {
  const msg = String(e.message || '') + String(e.stderr || '');
  if (/registry-1\.docker\.io|failed to resolve|connectex|i\/o timeout/i.test(msg)) {
    hintRegistryTimeout();
  }
  throw e;
}

if (existsSync(tarPath)) unlinkSync(tarPath);
if (existsSync(archiveGz)) unlinkSync(archiveGz);

console.log(`\n>>> 导出镜像...\n`);
run(`docker save -o "${tarPath}" ${image}`);

const sizeMb = (statSync(tarPath).size / 1024 / 1024).toFixed(2);
console.log(`\n完成: ${tarPath} (${sizeMb} MB)`);
console.log('\n请上传到服务器 node2，与 deploy/run-on-server.sh 放在同一目录。');
console.log('服务器执行: bash run-on-server.sh\n');
