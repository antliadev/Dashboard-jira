/**
 * api/auth/index.js — Auth consolidado para Vercel
 * GET /api/auth — verificar sessão
 * POST /api/auth — login
 * DELETE /api/auth — logout
 * 
 * NOTA: Em ambiente serverless Vercel, sessões em memória não persistem.
 * O sistema foi refatorado para usar autenticação baseada em credenciais do Jira:
 * - Se há credenciais do Jira configuradas, o acesso é permitido automaticamente
 * - Login só é necessário se quiser acesso restrito sem credenciais Jira
 */

import { configService } from '../../lib/configService.js';
import { isConfigured, supabase } from '../../lib/supabaseServer.js';

const VALID_EMAIL = 'admin@gmail.com';
const VALID_PASSWORD = 'admin123';

/**
 * Armazena sessão no Supabase (tabela: user_sessions)
 * Isso permite que as sessões persistam entre requests serverless
 */
async function storeSession(sessionId, email) {
  if (isConfigured && supabase) {
    try {
      await supabase
        .from('user_sessions')
        .upsert({
          session_id: sessionId,
          email: email,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }, { onConflict: 'session_id' });
    } catch (e) {
      console.warn('[Auth] Erro ao store sessão no Supabase:', e.message);
    }
  }
}

async function validateSession(sessionId) {
  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();
      
      if (error || !data) return null;
      
      if (new Date(data.expires_at) < new Date()) {
        // Sessão expirada - limpar
        await supabase.from('user_sessions').delete().eq('session_id', sessionId);
        return null;
      }
      
      return data;
    } catch (e) {
      console.warn('[Auth] Erro ao validar sessão:', e.message);
      return null;
    }
  }
  return null;
}

async function deleteSession(sessionId) {
  if (isConfigured && supabase) {
    try {
      await supabase.from('user_sessions').delete().eq('session_id', sessionId);
    } catch (e) {
      console.warn('[Auth] Erro ao deletar sessão:', e.message);
    }
  }
}

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

export default async function handler(req, res) {
  // POST = login
  if (req.method === 'POST') {
    const { email, password } = req.body;
    
    // Primeiro verificar credenciais do Jira
    const conn = isConfigured && supabase ? await configService.getActiveConnection() : null;
    const hasJiraCredentials = conn && conn.baseUrl && conn.email && conn.token;
    
    // Se tem credenciais do Jira, não precisa de login do usuário
    // O acesso será baseado nas credenciais do banco (já implementado no verifyAuth)
    if (hasJiraCredentials) {
      return res.status(200).json({
        success: true,
        message: 'Acesso permitido via credenciais do Jira',
        authenticated: true,
        authType: 'jira'
      });
    }
    
    // Se não tem credenciais do Jira, verificar login do usuário
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const sessionId = generateSessionId();
    await storeSession(sessionId, email);
    
    return res.status(200).json({ 
      success: true, 
      sessionId: sessionId, 
      email: email,
      authenticated: true,
      authType: 'user'
    });
  }

  // DELETE = logout
  if (req.method === 'DELETE') {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) await deleteSession(sessionId);
    return res.status(200).json({ success: true, message: 'Logout realizado' });
  }

  // GET = check (padrão ou via método diferente)
  if (req.method === 'GET' || (req.method === 'POST' && req.query.check)) {
    const sessionId = req.headers['x-session-id'];
    
    // Primeiro verificar se há credenciais do Jira configuradas
    const conn = isConfigured && supabase ? await configService.getActiveConnection() : null;
    const hasJiraCredentials = conn && conn.baseUrl && conn.email && conn.token;
    
    if (hasJiraCredentials) {
      return res.status(200).json({ 
        authenticated: true, 
        authType: 'jira',
        message: 'Acesso via credenciais do Jira'
      });
    }
    
    // Se não tem credenciais do Jira, verificar sessão do usuário
    if (!sessionId) return res.status(200).json({ authenticated: false });
    
    const session = await validateSession(sessionId);
    if (!session) return res.status(200).json({ authenticated: false });
    
    return res.status(200).json({ authenticated: true, email: session.email, authType: 'user' });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}