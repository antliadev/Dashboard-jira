/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Step 1: return simple text
    res.statusCode = 200;
    res.end('OK ' + req.method + ' ' + req.url);
    return;
  }

  app(req, res);
}
