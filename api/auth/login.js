/**
 * api/auth/login.js — Endpoint de login para Vercel
 */

const VALID_EMAIL = 'admin@gmail.com';
const VALID_PASSWORD = 'admin123';

const sessions = new Map();

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

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

  return res.status(200).json({
    success: true,
    sessionId: session.id,
    email: session.email
  });
}