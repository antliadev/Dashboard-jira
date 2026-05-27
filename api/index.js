/**
 * api/index.js — Single entry point for all Vercel API routes.
 */
export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server/index.js');

    // Debug: always return body info for /api/debug
    if (req.url === '/api/debug') {
      const bodyStr = Buffer.isBuffer(req.body) ? 'Buffer'
        : typeof req.body === 'string' ? 'string:' + req.body.slice(0, 100)
        : typeof req.body === 'object' && req.body !== null ? 'object:' + JSON.stringify(req.body).slice(0, 200)
        : String(req.body);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('body=' + bodyStr + ' | ct=' + (req.headers['content-type'] || ''));
      return;
    }

    // Normalize body before Express processes it
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const ct = req.headers['content-type'] || '';
      if (ct.startsWith('application/json')) {
        if (Buffer.isBuffer(req.body)) {
          req.body = JSON.parse(req.body.toString('utf8'));
        } else if (typeof req.body === 'string') {
          req.body = JSON.parse(req.body);
        } else if (typeof req.body !== 'object' || req.body === null) {
          req.body = {};
        }
      }
    }

    app(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message, stack: err.stack?.split('\n').slice(0, 5).join('|') }));
  }
}
