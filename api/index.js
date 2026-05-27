/**
 * api/index.js — Single entry point with rewrite
 */
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('ok');
}
