import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8788);
export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      // Only the public preview assets are served, never the parent app or its .env.
      if (!['index.html', 'app.js', 'core.js', 'data.js', 'styles.css'].includes(relative)) {
        res.writeHead(404).end('Not found'); return;
      }
      const body = await readFile(path.join(root, relative));
      res.writeHead(200, {
        'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(relative)] + '; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      });
      res.end(body);
    } catch { res.writeHead(400).end('Bad request'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, '127.0.0.1', () => console.log(`DuoDialect preview: http://127.0.0.1:${port}`));
}
