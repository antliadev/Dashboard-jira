/**
 * server/auth.js - Módulo de autenticação
 * Login único compartilhado para 3 usuários
 */

// Credenciais hardcoded (pode mover para .env se necessário)
const VALID_EMAIL = 'admin@gmail.com';
const VALID_PASSWORD = 'admin123';

// Armazenamento de sessões em memória (em produção, usar Redis ou BD)
const sessions = new Map();

/**
 * Gera um ID de sessão único
 */
function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Valida credenciais do usuário
 */
function validateCredentials(email, password) {
  return email === VALID_EMAIL && password === VALID_PASSWORD;
}

/**
 * Cria uma nova sessão
 */
function createSession(email) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    email: email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
  };
  
  sessions.set(sessionId, session);
  return session;
}

/**
 * Valida uma sessão existente
 */
function validateSession(sessionId) {
  const session = sessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Verificar expiração
  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(sessionId);
    return null;
  }
  
  return session;
}

/**
 * Destroi uma sessão
 */
function destroySession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Middleware Express para verificar autenticação
 */
function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  
  const session = validateSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida' });
  }
  
  // Adicionar sessão ao request para uso posterior
  req.session = session;
  next();
}

/**
 * Endpoint de login
 */
function handleLogin(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  
  if (!validateCredentials(email, password)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  
  const session = createSession(email);
  
  res.json({
    success: true,
    sessionId: session.id,
    email: session.email
  });
}

/**
 * Endpoint de logout
 */
function handleLogout(req, res) {
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
  
  if (sessionId) {
    destroySession(sessionId);
  }
  
  res.json({ success: true, message: 'Logout realizado' });
}

/**
 * Endpoint para verificar sessão atual
 */
function handleCheckSession(req, res) {
  const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ authenticated: false });
  }
  
  const session = validateSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ authenticated: false });
  }
  
  res.json({
    authenticated: true,
    email: session.email
  });
}

export {
  handleLogin,
  handleLogout,
  handleCheckSession,
  requireAuth,
  validateSession
};