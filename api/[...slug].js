/**
 * api/[...slug].js — Test if Express import causes the issue
 */
import app from '../server/index.js';

export default function handler(req, res) {
  // Just return OK without calling app()
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('imported but not called');
}
