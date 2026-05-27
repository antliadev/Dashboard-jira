/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Respond with bare minimum — no content-type header
    res.statusCode = 200;
    res.end('ok');
    return;
  }

  app(req, res);
}
