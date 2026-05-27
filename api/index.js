/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Dynamically import Express inside the handler to avoid 
 * module-level side effects that may interfere with Vercel rewrites.
 */
export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server/index.js');
    
    // Normalize body before Express processes it
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
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Import error', details: err.message }));
  }
}
