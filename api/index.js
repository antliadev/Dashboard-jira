/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK ' + req.method + ' ' + req.url);
    return;
  }

  app(req, res);
}
