import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { visualEditorApi } from './server/ve-api-plugin';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, dir, '');
  const rawBase = env.VE_BASE_PATH?.trim() || '/visual-editor/';
  const base =
    rawBase === '/'
      ? '/'
      : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`;
  const publicOrigin = env.VE_PUBLIC_ORIGIN?.trim().replace(/\/$/, '');

  /** 经 nginx 反代 /visual-editor/ 时：只配 host/port，勿设 hmr.path（会与 base 叠成 /visual-editor/visual-editor/） */
  let hmr: boolean | import('vite').HmrOptions = true;
  if (publicOrigin) {
    try {
      const u = new URL(publicOrigin);
      hmr = {
        host: u.hostname,
        protocol: u.protocol === 'https:' ? 'wss' : 'ws',
        port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
        clientPort: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
      };
    } catch {
      hmr = true;
    }
  }

  return {
    base,
    plugins: [
      react(),
      {
        name: 've-build-runtime',
        buildStart() {
          try {
            execSync('node scripts/build-runtime.mjs', { cwd: root, stdio: 'pipe' });
          } catch {
            /* 可手动运行 npm run build:runtime */
          }
        },
      },
      visualEditorApi(),
    ],
    server: {
      host: true,
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      hmr,
      ...(publicOrigin ? { origin: publicOrigin } : {}),
    },
    preview: {
      host: true,
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      hmr,
      ...(publicOrigin ? { origin: publicOrigin } : {}),
    },
    resolve: {
      alias: {
        '@ve/core': path.resolve(dir, '../packages/core/src/index.ts'),
        '@ve/code-engine': path.resolve(dir, '../packages/code-engine/src/index.ts'),
        '@ve/nlp': path.resolve(dir, '../packages/nlp/src/index.ts'),
      },
    },
  };
});
