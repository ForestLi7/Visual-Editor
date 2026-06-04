import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..');
mkdirSync(join(root, 'dist'), { recursive: true });
copyFileSync(join(root, 'dist', 'runtime.js'), join(root, 'dist', 'runtime.iife.js'));
