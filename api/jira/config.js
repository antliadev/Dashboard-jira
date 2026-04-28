import { configService } from '../../lib/configService.js';
import { isConfigured } from '../../lib/supabaseServer.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - retorna configuração
  if (req.method === 'GET') {
    try {
      const config = await configService.getConfigAsync();
      
      if (config.isConfigured) {
        return res.status(200).json({
          ...config,
          email: '' // Sempre vazio conforme solicitado
        });
      }
      
      // Se não tem conexão
      return res.status(200).json({
        isConfigured: false,
        source: 'supabase',
        message: 'Nenhuma conexão Jira configurada.',
        canEdit: true,
        isProduction: true,
        email: ''
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