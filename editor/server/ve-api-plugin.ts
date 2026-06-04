import type { Plugin, ViteDevServer } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, normalize } from 'path';
import { fileURLToPath } from 'url';
import {
  applyChangesToSource,
  applyChangesToCss,
  buildImportPageDiffs,
  buildPreviewDiffs,
} from '@ve/code-engine';
import type { SemanticChange } from '@ve/core';
import { injectRuntime, normalizeImportHtml } from './preview-proxy';
import { getImportedPage, saveImportedPage } from './import-store';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RUNTIME_PUBLIC = resolve(fileURLToPath(new URL('../public/ve-runtime.js', import.meta.url)));

/** 与 vite.config `base` 同步（如 /visual-editor/） */
let appBasePath = '';

function normalizeBasePath(base: string): string {
  if (!base || base === '/') return '';
  return `/${base.replace(/^\/+|\/+$/g, '')}`;
}

function stripPublicBase(pathname: string): string {
  const base = appBasePath;
  if (!base) return pathname;
  if (pathname === base) return '/';
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || '/';
  return pathname;
}

const OSS_UPLOAD_URL =
  process.env.VE_OSS_UPLOAD_URL ??
  'http://127.0.0.1:10070/ai-courseware/tool/upload-file-to-oss';

function getOssToolToken(): string | undefined {
  const token = process.env.VE_TOOL_TOKEN?.trim();
  return token || undefined;
}
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
function safePath(rel: string): string | null {
  const full = normalize(resolve(ROOT, rel));
  if (!full.startsWith(normalize(resolve(ROOT, 'demo-app')))) return null;
  return full;
}

function editorOrigin(req: import('http').IncomingMessage): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : null) ||
    req.headers.host ||
    'localhost:5174';
  const forwarded = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'http';
  return `${proto}://${host}${appBasePath}`;
}

function readRuntimeJs(): string | undefined {
  if (!existsSync(RUNTIME_PUBLIC)) return undefined;
  return readFileSync(RUNTIME_PUBLIC, 'utf-8');
}

function serveRuntimeJs(res: import('http').ServerResponse): boolean {
  const js = readRuntimeJs();
  if (!js) {
    return false;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(js);
  return true;
}

function handleOssUpload(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const ossToken = getOssToolToken();
  if (!ossToken) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ ok: false, error: '未配置 VE_TOOL_TOKEN，无法上传 OSS' })
    );
    return;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  req.on('data', (chunk: Buffer) => {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) {
      req.destroy();
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: '文件超过 30MB 限制' }));
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    void (async () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] ?? '';
        const upstream = await fetch(OSS_UPLOAD_URL, {
          method: 'POST',
          headers: {
            'X-Tool-Token': ossToken,
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body,
        });

        const raw = await upstream.text();
        let parsed: { code?: number; message?: string; data?: string } = {};
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: '上传服务返回非 JSON' }));
          return;
        }

        const url = typeof parsed.data === 'string' ? parsed.data.trim() : '';
        const codeOk =
          parsed.code === undefined || parsed.code === 200 || parsed.code === 0;
        if (!upstream.ok || !codeOk || !url.startsWith('http')) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: parsed.message ?? `上传失败（HTTP ${upstream.status}）`,
            })
          );
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, url }));
      } catch (e) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    })();
  });
}

function setupMiddleware(server: ViteDevServer) {
  server.middlewares.use((req, res, next) => {
    const path = stripPublicBase(req.url?.split('?')[0] ?? '');

    if (path === '/api/upload/oss') {
      handleOssUpload(req, res);
      return;
    }

    if (path === '/ve-runtime.js') {
      if (serveRuntimeJs(res)) return;
      res.statusCode = 404;
      res.end('ve-runtime.js not found. Run: npm run build:runtime');
      return;
    }

    if (path === '/api/import/page') {
      const q = new URL(req.url ?? '', 'http://localhost');
      const id = q.searchParams.get('id');
      const page = id ? getImportedPage(id) : undefined;
      if (!page) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<html><body><p>导入页面已过期或不存在，请重新导入。</p></body></html>');
        return;
      }
      const origin = editorOrigin(req);
      const baseHref =
        page.baseHref === 'about:blank' ? `${origin}/` : page.baseHref;
      const html = injectRuntime(page.html, baseHref, readRuntimeJs(), origin);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(html);
      return;
    }

    if (path === '/api/import/html' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy();
          res.statusCode = 413;
          res.end(JSON.stringify({ ok: false, error: 'HTML 超过 5MB 限制' }));
        }
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as {
            html?: string;
            label?: string;
            baseHref?: string;
          };
          const html = payload.html?.trim();
          if (!html || !html.includes('<')) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: '无效的 HTML 内容' }));
            return;
          }
          const page = saveImportedPage(
            normalizeImportHtml(html),
            payload.label ?? '导入的网页',
            payload.baseHref ?? 'about:blank'
          );
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, id: page.id, label: page.label }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
      return;
    }

    next();
  });

  server.middlewares.use('/api/health', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });

  server.middlewares.use('/api/diff/preview', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { changes, importId } = JSON.parse(body) as {
          changes: SemanticChange[];
          importId?: string;
        };

        if (importId) {
          const page = getImportedPage(importId);
          if (page) {
            const hunks = buildImportPageDiffs(changes ?? [], importId, page.label);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, hunks }));
            return;
          }
        }

        const config = JSON.parse(
          readFileSync(resolve(ROOT, '.visualeditorrc.json'), 'utf-8')
        ) as { projectId: string; tokens: Record<string, string>; fileMap: Record<string, string> };

        const hunks = buildPreviewDiffs(
          changes ?? [],
          config,
          (rel) => {
            const full = safePath(rel);
            if (!full || !existsSync(full)) return null;
            return readFileSync(full, 'utf-8');
          },
          applyChangesToSource,
          applyChangesToCss
        );

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, hunks }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
  });

  server.middlewares.use('/api/apply', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { changes, files } = JSON.parse(body) as {
          changes: SemanticChange[];
          files: { path: string }[];
        };
        const applied: string[] = [];
        const errors: string[] = [];

        const paths = new Set(files.map((f) => f.path));
        if (changes.some((c) => c.kind === 'style')) {
          paths.add('demo-app/src/App.css');
        }

        for (const rel of paths) {
          const full = safePath(rel);
          if (!full) {
            errors.push(`不允许写入: ${rel}`);
            continue;
          }
          const content = readFileSync(full, 'utf-8');
          const next = rel.endsWith('.css')
            ? applyChangesToCss(content, changes)
            : applyChangesToSource(content, changes);
          writeFileSync(full, next, 'utf-8');
          applied.push(rel);
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: errors.length === 0, applied, errors }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
  });
}

export function visualEditorApi(): Plugin {
  return {
    name: 'visual-editor-api',
    configResolved(config) {
      appBasePath = normalizeBasePath(config.base);
    },
    configureServer(server) {
      setupMiddleware(server);
    },
    configurePreviewServer(server) {
      setupMiddleware(server);
    },
  };
}
