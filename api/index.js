/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Must NOT use res.writeHead() in Vercel rewrite context — it causes 400
    // Use res.statusCode + res.setHeader + res.end instead
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      method: req.method,
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      isString: typeof req.body === 'string',
      isObj: typeof req.body === 'object' && !Buffer.isBuffer(req.body),
      bodyPreview: typeof req.body === 'string' ? req.body.slice(0, 200)
        : Buffer.isBuffer(req.body) ? req.body.toString('utf8').slice(0, 200)
        : typeof req.body === 'object' && req.body ? JSON.stringify(req.body).slice(0, 200)
        : String(req.body).slice(0, 200),
    }));
    return;
  }

  app(req, res);
}
