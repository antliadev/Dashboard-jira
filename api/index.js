/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Step 5: application/json content-type + text body
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end('just text');
    return;
  }

  app(req, res);
}
