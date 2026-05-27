/**
 * api/index.js
 */
import app from '../server/index.js';

export default function handler(req, res) {
  if (req.url === '/api/debug') {
    // Step 7: JSON.stringify of a hardcoded object
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    const data = { a: 1, b: "hello" };
    res.end(JSON.stringify(data));
    return;
  }

  app(req, res);
}
