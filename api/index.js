/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Vercel's Node.js runtime pre-parses req.body for function handlers.
 * We normalize body before Express processes it.
 * 
 * Routes covered: all /api/auth and /api/jira/* routes.
 */
import app from '../server/index.js';

/**
 * Read raw body from the request stream (Vercel's IncomingMessage).
 */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Debug: echo /api/debug
  if (req.url === '/api/debug') {
    const rawBody = await readRawBody(req);
    res.json({
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyIsObject: typeof req.body === 'object' && !Buffer.isBuffer(req.body) && req.body !== null,
      rawBody: rawBody || null,
      bodyKeys: typeof req.body === 'object' && req.body ? Object.keys(req.body) : null,
      hasContentType: !!req.headers['content-type'],
    });
    return;
  }

  // Ensure body is parsed for JSON requests
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('application/json')) {
      // Vercel may set req.body as Buffer (raw), string, parsed object, or leave undefined
      if (Buffer.isBuffer(req.body)) {
        const raw = req.body.toString('utf8');
        try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      } else if (typeof req.body === 'string') {
        try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
      } else if (!req.body || typeof req.body !== 'object') {
        // Read from stream if not already parsed
        const raw = await readRawBody(req);
        if (raw) {
          try { req.body = JSON.parse(raw); } catch { req.body = {}; }
        } else {
          req.body = {};
        }
      }
    }
  }

  app(req, res);
}
