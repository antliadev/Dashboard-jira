/**
 * api/auth/index.js — Auth consolidado para Vercel
 * GET /api/auth — verificar sessão
 * POST /api/auth — login
 * DELETE /api/auth — logout
 */

const VALID_EMAIL = 'admin@gmail.com';
const VALID_PASSWORD = 'admin123';
const sessions = new Map();

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

export default async function handler(req, res) {
  // POST = login
  if (req.method === 'POST') {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const sessionId = generateSessionId();
    const session = {
      id: sessionId,
      email: email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    sessions.set(sessionId, session);
    return res.status(200).json({ success: true, sessionId: session.id, email: session.email });
  }

  // DELETE = logout
  if (req.method === 'DELETE') {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) sessions.delete(sessionId);
    return res.status(200).json({ success: true, message: 'Logout realizado' });
  }

  // GET = check (padrão ou via método diferente)
  if (req.method === 'GET' || req.method === 'POST' && req.query.check) {
    const sessionId = req.headers['x-session-id'];
    if (!sessionId) return res.status(200).json({ authenticated: false });
    const session = sessions.get(sessionId);
    if (!session) return res.status(200).json({ authenticated: false });
    if (new Date(session.expiresAt) < new Date()) {
      sessions.delete(sessionId);
      return res.status(200).json({ authenticated: false });
    }
    return res.status(200).json({ authenticated: true, email: session.email });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}