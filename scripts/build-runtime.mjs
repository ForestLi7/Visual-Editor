import * as esbuild from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');

// 必须先有 packages/core/dist（@ve/core 的 main），否则 ve-runtime 会打进过期的 isAllowedOrigin
await esbuild.build({
  entryPoints: [resolve(root, 'packages/runtime/src/runtime.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: resolve(root, 'editor/public/ve-runtime.js'),
  target: ['es2020'],
  logLevel: 'info',
});

console.log('Built editor/public/ve-runtime.js');
