/**
 * api/auth/index.js — Autenticação reconstruída
 * 
 * POST /api/auth — login
 * GET  /api/auth — verificar sessão
 * DELETE /api/auth — logout
 * 
 * REGRAS:
 * - Login obrigatório para TODAS as rotas (exceto /login)
 * - Sessão persistida no Supabase (user_sessions)
 * - Credenciais fixas: admin@jira.com / admin123
 * - NÃO usa credenciais Jira como bypass
 */

import { isConfigured, supabase } from '../../lib/supabaseServer.js';

const VALID_EMAIL = 'admin@jira.com';
const VALID_PASSWORD = 'admin123';

// ─── Sessão no Supabase ─────────────────────────────────

function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const extraRandom = Math.random().toString(36).substring(2, 8);
  return `sess_${timestamp}_${randomPart}${extraRandom}`;
}

async function storeSession(sessionId, email) {
  if (!isConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('user_sessions')
      .upsert({
        session_id: sessionId,
        email: email,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
      }, { onConflict: 'session_id' });

    if (error) {
      console.warn('[Auth] Erro ao persistir sessão:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Auth] Exceção ao persistir sessão:', e.message);
    return false;
  }
}

async function validateSession(sessionId) {
  if (!isConfigured || !supabase || !sessionId) return null;

  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) return null;

    // Verificar expiração
    if (new Date(data.expires_at) < new Date()) {
      await supabase.from('user_sessions').delete().eq('session_id', sessionId);
      return null;
    }

    return data;
  } catch (e) {
    console.warn('[Auth] Exceção ao validar sessão:', e.message);
    return null;
  }
}

async function deleteSession(sessionId) {
  if (!isConfigured || !supabase || !sessionId) return;

  try {
    await supabase.from('user_sessions').delete().eq('session_id', sessionId);
  } catch (e) {
    console.warn('[Auth] Exceção ao deletar sessão:', e.message);
  }
}

// ─── Handler Principal ─────────────────────────────────

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ─── POST = Login ───
  if (req.method === 'POST') {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const sessionId = generateSessionId();
    const stored = await storeSession(sessionId, email);

    if (!stored) {
      // Fallback: retornar sessão mesmo sem persistir (funciona para dev)
      console.warn('[Auth] Sessão não persistida no banco (Supabase pode não estar configurado)');
    }

    return res.status(200).json({
      success: true,
      sessionId: sessionId,
      email: email,
      authenticated: true
    });
  }

  // ─── DELETE = Logout ───
  if (req.method === 'DELETE') {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) await deleteSession(sessionId);
    return res.status(200).json({ success: true, message: 'Logout realizado' });
  }

  // ─── GET = Check ───
  if (req.method === 'GET') {
    const sessionId = req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(200).json({ authenticated: false });
    }

    const session = await validateSession(sessionId);

    if (!session) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      email: session.email
    });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}