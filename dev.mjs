/**
 * dev.mjs — Development server with live reload
 *
 * Features:
 *   - Serves dist/ over HTTP (default: http://localhost:3000)
 *   - Watches src/ for any file changes → rebuilds automatically
 *   - Live reload via SSE: injects a tiny <script> into HTML responses
 *     that listens for rebuild events and calls location.reload()
 *   - Debounces rapid file saves to avoid duplicate builds
 *
 * Usage: node dev.mjs [port]
 *   PORT env var or first CLI arg overrides default port 3000.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import { buildAll } from './build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST      = path.join(__dirname, 'dist');
const SRC       = path.join(__dirname, 'src');
const PORT      = Number(process.env.PORT || process.argv[2] || 3000);

// ─── SSE client registry ─────────────────────────────────────────────────────

const clients = new Set();

function notifyClients() {
  for (const res of clients) {
    res.write('data: reload\n\n');
  }
}

// ─── Live reload snippet (injected before </body>) ───────────────────────────

const RELOAD_SCRIPT = `
<script>
(function () {
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();
  es.onerror   = () => { es.close(); /* silently stop on build error */ };
})();
</script>`;

// ─── MIME map ─────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
};

// ─── HTTP server ──────────────────────────────────────────────────────────────

async function requestHandler(req, res) {
  // SSE endpoint — kept alive for live reload
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering if proxied
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Resolve URL path → file in dist/
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  if (!path.extname(urlPath)) urlPath += '.html'; // /chiu-local → /chiu-local.html

  const filePath = path.join(DIST, urlPath);

  // Security: prevent path traversal outside dist/
  if (!filePath.startsWith(DIST + path.sep) && filePath !== DIST) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath);
  const isHtml = ext === '.html';

  try {
    const raw = await fs.readFile(filePath, isHtml ? 'utf-8' : null);
    const body = isHtml ? raw.replace('</body>', `${RELOAD_SCRIPT}\n</body>`) : raw;
    res.writeHead(200, {
      'Content-Type':  MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    // Try serving 404.html for missing pages
    try {
      const notFound = await fs.readFile(path.join(DIST, '404.html'), 'utf-8');
      const body = notFound.replace('</body>', `${RELOAD_SCRIPT}\n</body>`);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  }
}

// ─── File watcher with debounce ───────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Initial build
  console.log('[dev] Building...');
  await buildAll();

  // Start HTTP server
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`\n[dev] 🚀  http://localhost:${PORT}`);
    console.log('[dev] Watching src/ for changes...\n');
  });

  // Watch src/ — rebuild + notify on any change
  let building = false;

  const rebuild = debounce(async () => {
    if (building) return;
    building = true;
    console.log('[dev] Change detected — rebuilding...');
    try {
      await buildAll();
      notifyClients();
    } catch (err) {
      console.error('[dev] Build failed:', err.message);
    } finally {
      building = false;
    }
  }, 150);

  chokidar
    .watch(SRC, { ignoreInitial: true })
    .on('change', rebuild)
    .on('add',    rebuild)
    .on('unlink', rebuild);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[dev] Shutting down.');
    server.close();
    process.exit(0);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
