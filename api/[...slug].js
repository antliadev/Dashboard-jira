/**
 * api/index.js — Single entry point for all Vercel API routes.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Debug endpoint
  if (req.url === '/api/debug') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      ct: req.headers['content-type'],
      bodyType: typeof req.body,
    }));
    return;
  }

  app(req, res);
}
