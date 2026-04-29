/**
 * api/auth/verify.js — Verificação de autenticação para APIs do Jira
 * 
 * Este módulo centraliza a verificação de autenticação para todas as APIs.
 * Em ambiente Vercel serverless, as sessões em memória não persistem entre requests.
 * Por isso, usamos uma estratégia híbrida:
 * 1. Verifica credenciais do Jira (se configuradas) - acesso sem login é possível
 * 2. Verifica sessão do usuário (se requerido)
 */

import { configService } from '../../lib/configService.js';
import { isConfigured, supabase } from '../../lib/supabaseServer.js';

/**
 * Verifica se a requisição tem acesso aos dados do Jira
 * Retorna:
 * - true: acesso permitido
 * - false: acesso bloqueado (resposta já enviada)
 */
export async function verifyAuth(req, res) {
  // Se não está em produção Vercel, permite tudo (dev mode)
  const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  const IS_PRODUCTION = process.env.NODE_ENV === 'production' || IS_VERCEL;
  
  if (!IS_PRODUCTION) {
    return true;
  }

  // Se Supabase não está configurado, permitir acesso temporariamente
  // Isso permite que a página de dados funcione para configurar credenciais
  if (!isConfigured || !supabase) {
    console.warn('[verifyAuth] Supabase não configurado - permitindo acesso temporário para configuração');
    return true;
  }

  // 1) Verificar se há credenciais do Jira configuradas
  // Se sim, o sistema funciona como "acesso público" baseado nas credenciais do banco
  let conn = null;
  try {
    conn = await configService.getActiveConnection();
  } catch (e) {
    console.warn('[verifyAuth] Erro ao buscar conexão:', e.message);
  }
  
  if (conn && conn.baseUrl && conn.email && conn.token) {
    // Há credenciais do Jira configuradas - acesso permitido
    return true;
  }

  // 2) Se não há credenciais, verificar sessão do usuário
  const sessionId = req.headers['x-session-id'];
  
  // Se tem sessão, verificar se é válida
  if (sessionId) {
    try {
      // Verificar no endpoint de auth
      const authResponse = await fetch(`${req.protocol}://${req.get('host')}/api/auth?check=1`, {
        method: 'GET',
        headers: { 'x-session-id': sessionId }
      });
      
      if (authResponse.ok) {
        const data = await authResponse.json();
        if (data.authenticated) {
          return true;
        }
      }
    } catch (e) {
      // Erro ao verificar - fallback para permitir em caso de falha de rede
      console.warn('[verifyAuth] Erro ao verificar sessão:', e.message);
    }
  }

  // 3) Sem credenciais e sem sessão válida - bloquear acesso
  // Mas permitir acesso à rota /api/jira/config para configurar
  const path = req.url || '';
  if (path.includes('/config') || path.includes('/test-connection')) {
    return true; // Permite configuração inicial sem login
  }

  res.status(401).json({ 
    error: 'Acesso não autorizado',
    message: 'Configure as credenciais do Jira ou faça login para acessar os dados.'
  });
  
  return false;
}

/**
 * Middleware para rotas que exigem autenticação obrigatória
 * (não aceita apenas credenciais do Jira)
 */
export function requireLogin(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Login obrigatório para esta ação' });
  }
  
  next();
}