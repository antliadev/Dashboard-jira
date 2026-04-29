/**
 * api/auth/verify.js — Verificação de autenticação para APIs
 * Usage: import { verifyAuth } from './auth/verify.js';
 *        await verifyAuth(req, res);
 */

const sessions = new Map();

export async function verifyAuth(req, res) {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId) {
    res.status(401).json({ error: 'Acesso não autorizado' });
    return false;
  }
  
  const session = sessions.get(sessionId);
  
  if (!session) {
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
    return false;
  }
  
  req.session = session;
  return true;
}

export function addSession(sessionId, email) {
  sessions.set(sessionId, {
    id: sessionId,
    email: email,
    createdAt: new Date().toISOString()
  });
}