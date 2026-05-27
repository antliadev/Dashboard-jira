/**
 * api/[...slug].js — Catch-all entry point
 */
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('ok');
}
