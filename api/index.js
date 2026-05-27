/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Step 6: text/plain CT + long text with curly braces
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('{ "this": "has", "braces": true }');
    return;
  }

  app(req, res);
}
