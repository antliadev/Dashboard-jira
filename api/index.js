/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Vercel's Node.js runtime pre-parses the body for function handlers.
 * We ensure req.body is a proper object before passing to Express.
 *
 * CRITICAL: Do NOT use res.writeHead() — it causes 400 with Vercel rewrites.
 * Use res.statusCode + res.setHeader + res.end() instead.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Debug endpoint — dump request info
  if (req.url === '/api/debug') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      ct: req.headers['content-type'],
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      isString: typeof req.body === 'string',
      isObj: typeof req.body === 'object' && !Buffer.isBuffer(req.body) && req.body !== null,
      body: typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string' ? req.body.slice(0, 200)
        : Buffer.isBuffer(req.body) ? req.body.toString('utf8').slice(0, 200)
        : String(req.body).slice(0, 200),
    }));
    return;
  }

  // Normalize body for non-GET JSON requests before Express sees it
  // Vercel pre-parses req.body as string/Buffer/object depending on runtime.
  // Express's express.json() skips if req.body !== undefined.
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('application/json')) {
      if (Buffer.isBuffer(req.body)) {
        try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
      } else if (typeof req.body === 'string') {
        try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
      } else if (typeof req.body !== 'object' || req.body === null) {
        req.body = {};
      }
    }
  }

  app(req, res);
}
