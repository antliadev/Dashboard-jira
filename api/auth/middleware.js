/**
 * api/auth/middleware.js — Middleware de autenticação para Vercel
 * Protege todas as rotas de API que exigem login
 * 
 * ATUALIZADO: Agora verifica tanto credenciais do Jira quanto sessões de usuário.
 */

import { configService } from '../../lib/configService.js';
import { isConfigured, supabase } from '../../lib/supabaseServer.js';

/**
 * Middleware para verificar autenticação
 * Suporta dois modos:
 * 1. Via credenciais do Jira (se configuradas no banco)
 * 2. Via sessão de usuário (se fez login)
 */
export async function requireAuth(req, res, next) {
  // 1) Verificar credenciais do Jira
  const conn = isConfigured && supabase ? await configService.getActiveConnection() : null;
  const hasJiraCredentials = conn && conn.baseUrl && conn.email && conn.token;
  
  if (hasJiraCredentials) {
    return next(); // Acesso permitido via credenciais do Jira
  }
  
  // 2) Verificar sessão do usuário
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }
  
  // Validar sessão no Supabase
  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();
      
      if (error || !data) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada' });
      }
      
      if (new Date(data.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Sessão expirada' });
      }
      
      req.session = data;
      return next();
    } catch (e) {
      console.error('[Auth middleware] Erro:', e.message);
      return res.status(500).json({ error: 'Erro ao validar sessão' });
    }
  }
  
  // Se não tem Supabase configurado, permitir (dev mode)
  return next();
}