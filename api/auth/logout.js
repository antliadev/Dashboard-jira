/**
 * api/auth/logout.js — Logout para Vercel
 */

const sessions = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const sessionId = req.headers['x-session-id'];
  
  if (sessionId) {
    sessions.delete(sessionId);
  }

  return res.status(200).json({ success: true, message: 'Logout realizado' });
}