/**
 * 打包测试环境发布物（不含 node_modules，需在服务器 npm ci）
 * 用法：node scripts/pack-release.mjs
 * 子路径：VE_BASE_PATH=/visual-editor/ node scripts/pack-release.mjs
 */
import { execSync } from 'child_process';
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
} from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outName = 'visual-editor-release';
const outDir = join(root, 'release', outName);
const basePath = process.env.VE_BASE_PATH?.trim() || '/visual-editor/';
const isWin = process.platform === 'win32';

console.log('[pack] VE_BASE_PATH =', basePath);
console.log('[pack] building editor...');

execSync('npm run build:runtime && npm run build -w editor', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VE_BASE_PATH: basePath },
});

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

function copyPath(fromRel, toRel) {
  const src = join(root, fromRel);
  const dest = join(outDir, toRel);
  if (!existsSync(src)) {
    console.warn(`[pack] skip missing: ${fromRel}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  if (isWin) {
    const st = statSync(src);
    if (st.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      try {
        execSync(
          `robocopy "${src}" "${dest}" /E /NFL /NDL /NJH /NJS /nc /ns /np`,
          { stdio: 'pipe' }
        );
      } catch (e) {
        const code = e && typeof e === 'object' && 'status' in e ? e.status : 8;
        if (code >= 8) throw e;
      }
    } else {
      cpSync(src, dest);
    }
  } else {
    cpSync(src, dest, { recursive: true });
  }
}

const paths = [
  ['package.json', 'package.json'],
  ['package-lock.json', 'package-lock.json'],
  ['.visualeditorrc.json', '.visualeditorrc.json'],
  ['editor/dist', 'editor/dist'],
  ['editor/public', 'editor/public'],
  ['editor/package.json', 'editor/package.json'],
  ['editor/vite.config.ts', 'editor/vite.config.ts'],
  ['editor/server', 'editor/server'],
  ['editor/index.html', 'editor/index.html'],
  ['deploy', 'deploy'],
  ['fixtures', 'fixtures'],
  ['scripts/start-production.sh', 'scripts/start-production.sh'],
  ['deploy/install-node-linux.sh', 'deploy/install-node-linux.sh'],
  ['deploy/install-node-el7.sh', 'deploy/install-node-el7.sh'],
  ['deploy/Dockerfile', 'deploy/Dockerfile'],
];

for (const [from, to] of paths) {
  console.log(`[pack] copy ${from}`);
  copyPath(from, to);
}

// 避免 Windows 打包的 .sh 在 Linux 上出现 CRLF / set: pipefail 无效
for (const sub of ['scripts', 'deploy']) {
  const dir = join(outDir, sub);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.sh')) continue;
    const f = join(dir, name);
    const text = readFileSync(f, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    writeFileSync(f, text, 'utf-8');
  }
}

const envExample = `# 复制为 .env 后由 start-production.sh 加载
VE_BASE_PATH=${basePath}
PORT=5174
# VE_OSS_UPLOAD_URL=http://127.0.0.1:10070/ai-courseware/tool/upload-file-to-oss
# VE_TOOL_TOKEN=your-token
`;
mkdirSync(join(outDir, 'deploy'), { recursive: true });
writeFileSync(join(outDir, 'deploy', '.env.example'), envExample, 'utf-8');

const archiveZip = join(root, 'release', `${outName}.zip`);
const archiveTar = join(root, 'release', `${outName}.tar.gz`);

if (existsSync(archiveZip)) rmSync(archiveZip, { force: true });
if (existsSync(archiveTar)) rmSync(archiveTar, { force: true });

if (isWin) {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -LiteralPath '${outDir}' -DestinationPath '${archiveZip}' -Force"`,
    { stdio: 'inherit' }
  );
  const sizeMb = (statSync(archiveZip).size / 1024 / 1024).toFixed(2);
  console.log(`\n[pack] 完成: ${archiveZip} (${sizeMb} MB)`);
} else {
  execSync(`tar -czf "${archiveTar}" -C "${join(root, 'release')}" "${outName}"`, {
    stdio: 'inherit',
  });
  const sizeMb = (statSync(archiveTar).size / 1024 / 1024).toFixed(2);
  console.log(`\n[pack] 完成: ${archiveTar} (${sizeMb} MB)`);
}

console.log('[pack] 服务器解压后: npm ci && bash scripts/start-production.sh');
