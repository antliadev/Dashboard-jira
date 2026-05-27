/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Step 4: text/plain content-type, JSON body
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(JSON.stringify({
      step: 4,
      method: req.method,
      bodyType: typeof req.body,
    }));
    return;
  }

  app(req, res);
}
