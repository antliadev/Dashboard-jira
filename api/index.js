/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Minimal handler: just wraps Express and handles body parsing.
 * Vercel's Node.js runtime passes native req/res. The body is
 * available via different mechanisms depending on runtime version.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Debug: dump body info
  if (req.url === '/api/debug') {
    const bodyInfo = {
      method: req.method,
      url: req.url,
      ct: req.headers['content-type'],
      cl: req.headers['content-length'],
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyIsString: typeof req.body === 'string',
      bodyIsObj: typeof req.body === 'object' && !Buffer.isBuffer(req.body),
      bodyVal: (() => {
        try { return JSON.stringify(req.body).slice(0, 200); } catch { return String(req.body).slice(0, 200); }
      })(),
      bodyLen: Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'N/A'),
      hasOn: typeof req.on === 'function',
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(bodyInfo));
    return;
  }

  app(req, res);
}
