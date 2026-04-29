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
  // Se Supabase não está configurado, permitir acesso temporariamente
  // Isso permite que a página de dados funcione para configurar credenciais
  // sem necessidade de variáveis de ambiente configuradas no Vercel
  if (!isConfigured || !supabase) {
    return true;
  }

  // Se Supabase está configurado, verificar credenciais do Jira
  let conn = null;
  try {
    conn = await configService.getActiveConnection();
  } catch (e) {
    // Erro ao buscar conexão - permitir acesso
    return true;
  }
  
  if (conn && conn.baseUrl && conn.email && conn.token) {
    return true;
  }

  // Sem credenciais do Jira, verificar sessão do usuário
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    try {
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
      // Erro ao verificar - permitir acesso
      return true;
    }
  }

  // Verificar se é rota de configuração
  const path = req.url || '';
  if (path.includes('/config') || path.includes('/test-connection')) {
    return true;
  }

  res.status(401).json({ 
    error: 'Acesso não autorizado',
    message: 'Configure as credenciais do Jira ou faça login.'
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