/**
 * api/index.js — Single entry point for all Vercel API routes.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Debug without touching body at all
  if (req.url === '/api/debug') {
    res.status(200).json({
      method: req.method,
      ct: req.headers['content-type'],
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      isString: typeof req.body === 'string',
      isObj: typeof req.body === 'object' && !Buffer.isBuffer(req.body),
      val: (() => {
        try { return JSON.stringify(req.body).slice(0, 500); }
        catch { return String(req.body).slice(0, 500); }
      })(),
    });
    return;
  }

  // Normalize body for non-GET JSON requests
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('application/json')) {
      if (Buffer.isBuffer(req.body)) {
        try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
      } else if (typeof req.body === 'string') {
        try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
      } else if (!req.body || typeof req.body !== 'object') {
        req.body = {};
      }
    }
  }

  app(req, res);
}
