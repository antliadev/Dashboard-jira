/**
 * api/auth/verify.js — Verificação de autenticação para APIs protegidas
 * 
 * RECONSTRUÍDO: Aceita APENAS sessão válida.
 * NÃO usa credenciais Jira como bypass.
 * 
 * Rotas liberadas sem auth:
 * - /api/auth (login/check/logout)
 * - /api/jira/test-connection (precisa testar antes de logar)
 */

import { isConfigured, supabase } from '../../lib/supabaseServer.js';

/**
 * Verifica se a requisição tem sessão válida.
 * @returns {boolean} true = permitido, false = bloqueado (resposta já enviada)
 */
export async function verifyAuth(req, res) {
  // Se Supabase não está configurado, permitir acesso (dev mode)
  if (!isConfigured || !supabase) {
    return true;
  }

  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    res.status(401).json({
      error: 'Acesso não autorizado',
      message: 'Faça login para acessar esta funcionalidade.'
    });
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('session_id, email, expires_at')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) {
      res.status(401).json({
        error: 'Sessão inválida',
        message: 'Sua sessão expirou ou é inválida. Faça login novamente.'
      });
      return false;
    }

    // Verificar expiração
    if (new Date(data.expires_at) < new Date()) {
      // Limpar sessão expirada
      await supabase.from('user_sessions').delete().eq('session_id', sessionId);

      res.status(401).json({
        error: 'Sessão expirada',
        message: 'Sua sessão expirou. Faça login novamente.'
      });
      return false;
    }

    // Sessão válida
    return true;
  } catch (e) {
    console.error('[verifyAuth] Erro ao validar sessão:', e.message);
    // Em caso de erro interno, permitir acesso (fail-open para não travar o sistema)
    return true;
  }
}