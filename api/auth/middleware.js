/**
 * api/auth/middleware.js — Middleware de autenticação para Vercel
 * Protege todas as rotas de API que exigem login
 */

const sessions = new Map();

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

// Replicar o comportamento do servidor local
export function validateSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // Em ambiente serverless, as sessões são efêmeras
  // Então verificamos apenas se existe
  return session;
}

export function createSession(email) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    email: email,
    createdAt: new Date().toISOString()
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * Middleware para verificar autenticação
 */
export function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }
  
  const session = validateSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
  
  req.session = session;
  next();
}