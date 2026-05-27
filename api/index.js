/**
 * api/index.js — Single entry point for all Vercel API routes.
 *
 * Vercel's Node.js runtime pre-parses req.body for function handlers.
 * We normalize body before Express processes it.
 * 
 * Routes covered: all /api/auth and /api/jira/* routes.
 */
import app from '../server/index.js';

/**
 * Normalize req.body: Vercel may set it as parsed object, string, or Buffer.
 * Express's express.json() skips if req.body !== undefined, so we ensure
 * it's a proper object before Express sees it.
 */
function normalizeBody(req) {
  const ct = req.headers['content-type'] || '';
  if (!ct.startsWith('application/json')) return;

  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    req.body = raw ? safeParse(raw) : undefined;
  } else if (typeof req.body === 'string') {
    req.body = req.body ? safeParse(req.body) : undefined;
  }
  // If object (pre-parsed by Vercel), leave as-is
}

function safeParse(str) {
  try { return JSON.parse(str); }
  catch { return str; }
}

export default async function handler(req, res) {
  normalizeBody(req);
  app(req, res);
}
