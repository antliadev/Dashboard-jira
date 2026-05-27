/**
 * api/[...slug].js — Catch-all entry point for all Vercel API routes.
 *
 * Vercel's Node.js runtime pre-parses req.body for known content types.
 * But Express's express.json() tries to read from the stream which is
 * already consumed. We normalize req.body before calling Express.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // For non-GET JSON requests, ensure req.body is a proper object
  // BEFORE Express's express.json() middleware runs.
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
      // Express's express.json() skips if req.body !== undefined
    }
  }

  app(req, res);
}
