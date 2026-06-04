import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ve/core': path.resolve(root, 'packages/core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    fs: { allow: [root] },
  },
});
