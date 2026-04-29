/**
 * api/auth/check.js — Verificar sessão para Vercel
 */

const sessions = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(200).json({ authenticated: false });
  }

  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(200).json({ authenticated: false });
  }

  // Verificar expiração
  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(sessionId);
    return res.status(200).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    email: session.email
  });
}