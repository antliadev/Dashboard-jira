import { configService } from '../../lib/configService.js';
import { isConfigured } from '../../lib/supabaseServer.js';

export default async function handler(req, res) {
  // GET - retorna configuração
  if (req.method === 'GET') {
    try {
      const appConfig = configService.getConfig();
      
      // Se tem Supabase, buscar dados do banco
      if (isConfigured) {
        const conn = await configService.getActiveConnection();
        if (conn) {
          return res.status(200).json({
            isConfigured: true,
            source: 'supabase',
            baseUrl: conn.baseUrl,
            email: conn.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
            jql: conn.jql,
            cacheTtlMinutes: Math.floor((conn.cacheTtl || 600000) / 60000),
            hasToken: true,
            canEdit: true,
            isProduction: true
          });
        }
      }
      
      // Se não tem conexão
      return res.status(200).json({
        isConfigured: false,
        source: 'supabase',
        message: 'Nenhuma conexão Jira configurada.',
        canEdit: true,
        isProduction: true
      });
    } catch (error) {
      return res.status(200).json({
        error: error.message,
        canEdit: true
      });
    }
  }
  
  // POST - salvar configuração
  if (req.method === 'POST') {
    try {
      const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body || {};
      
      // Validar
      if (!baseUrl) {
        return res.status(400).json({ error: 'URL é obrigatória' });
      }
      if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório' });
      }
      if (!token) {
        return res.status(400).json({ error: 'Token é obrigatório' });
      }
      
      const updated = await configService.setConfig({ baseUrl, email, token, jql, cacheTtlMinutes });
      
      return res.status(200).json({
        success: true,
        message: 'Configuração salva com sucesso!',
        baseUrl: updated.baseUrl,
        email: updated.email,
        hasToken: true,
        isConfigured: true
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  return res.status(405).json({ error: 'Método não permitido' });
}