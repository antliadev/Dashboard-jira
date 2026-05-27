/**
 * api/index.js — Single entry point for all Vercel API routes.
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // For any /api/debug request, just echo back raw body info
  if (req.url === '/api/debug') {
    const bodyStr = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : typeof req.body === 'object' && req.body !== null
          ? JSON.stringify(req.body)
          : String(req.body);
    
    const lines = [
      `METHOD=${req.method}`,
      `URL=${req.url}`,
      `CT=${req.headers['content-type'] || ''}`,
      `CL=${req.headers['content-length'] || ''}`,
      `BODY_TYPE=${typeof req.body}`,
      `BODY_IS_BUFFER=${Buffer.isBuffer(req.body)}`,
      `BODY_LEN=${bodyStr.length}`,
      `BODY=${bodyStr.slice(0, 500)}`,
    ];
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(lines.join('\n'));
    return;
  }

  app(req, res);
}
