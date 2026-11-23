#!/usr/bin/env node
/**
 * Rebuild webhook + static server (no dependencies). Used by `make dev-local` and the
 * `web-build` container.
 *
 *   POST /__rebuild   (Authorization: Bearer $REBUILD_WEBHOOK_TOKEN) → 202, build queued
 *   GET  /__status    → { building, queued, lastBuildAt, lastOk, lastDurationMs }
 *   GET  /*           → files from dist/ with clean URLs (like Caddy in production)
 *
 * Builds go to dist-next/ and replace dist/ atomically, so visitors never see a half-built site.
 * A request that arrives during a build queues exactly one more build.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const NEXT = join(ROOT, 'dist-next');
const OLD = join(ROOT, 'dist-old');
const PORT = Number(process.env.BUILD_SERVER_PORT ?? 4322);
const HOST = process.env.BUILD_SERVER_HOST ?? '127.0.0.1';
const TOKEN = process.env.REBUILD_WEBHOOK_TOKEN ?? '';

const state = { building: false, queued: false, lastBuildAt: null, lastOk: null, lastDurationMs: null };

function runBuild() {
  return new Promise((done) => {
    const child = spawn('npx', ['astro', 'build', '--outDir', NEXT], { cwd: ROOT, stdio: 'inherit', env: process.env });
    child.on('close', (code) => done(code === 0));
  });
}

async function build() {
  if (state.building) {
    state.queued = true;
    return;
  }
  state.building = true;
  const started = Date.now();
  await rm(NEXT, { recursive: true, force: true });
  const ok = await runBuild();
  if (ok) {
    await rm(OLD, { recursive: true, force: true });
    await rename(DIST, OLD).catch(() => undefined);
    await rename(NEXT, DIST);
    await rm(OLD, { recursive: true, force: true });
  }
  Object.assign(state, { building: false, lastBuildAt: new Date().toISOString(), lastOk: ok, lastDurationMs: Date.now() - started });
  console.log(`[build-server] build ${ok ? 'OK' : 'FAILED'} in ${state.lastDurationMs} ms`);
  if (state.queued) {
    state.queued = false;
    void build();
  }
}

function authorized(req) {
  if (!TOKEN) return true; // local development without a token
  const got = Buffer.from(req.headers.authorization ?? '');
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

async function findFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.endsWith('/') ? [join(clean, 'index.html')] : [clean, `${clean}.html`, join(clean, 'index.html')];
  for (const c of candidates) {
    const full = join(DIST, c);
    if (!full.startsWith(DIST + sep)) continue; // path traversal guard (not dist-next/ etc.)
    const info = await stat(full).catch(() => null);
    if (info?.isFile()) return full;
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__rebuild' && req.method === 'POST') {
    if (!authorized(req)) {
      res.writeHead(401).end();
      return;
    }
    void build();
    res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify(state));
    return;
  }
  if (url.pathname === '/__status') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(state));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const file = (await findFile(url.pathname)) ?? (await findFile('/404.html'));
  if (!file) {
    res.writeHead(404).end('Todavía no hay un build. Esperá a que termine el primero.');
    return;
  }
  const status = file.endsWith('404.html') && url.pathname !== '/404' ? 404 : 200;
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`[build-server] http://${HOST}:${PORT}  (POST /__rebuild, GET /__status)`);
  if (process.env.BUILD_ON_START === '1') void build();
});
