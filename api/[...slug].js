/**
 * api/[...slug].js — Catch-all entry point for all Vercel API routes.
 *
 * Vercel's Node.js runtime provides native req/res but the body stream
 * may be consumed before Express can read it. We normalize req.body
 * for JSON requests before passing to Express.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Debug: return basic info for ANY request (temporary)
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    url: req.url,
    method: req.method,
    slug: req.query?.slug,
    ct: req.headers['content-type'],
    bodyType: typeof req.body,
    isBuffer: Buffer.isBuffer(req.body),
    isString: typeof req.body === 'string',
    isObj: typeof req.body === 'object' && !Buffer.isBuffer(req.body),
  }));
}
