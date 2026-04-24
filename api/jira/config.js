import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  // GET - retorna configuração
  if (req.method === 'GET') {
    try {
      const config = configService.getConfig();
      return res.status(200).json({
        baseUrl: config.baseUrl,
        email: config.email,
        fullEmail: config.fullEmail,
        token: config.token,
        jql: config.jql,
        cacheTtlMinutes: config.cacheTtlMinutes,
        hasToken: config.hasToken,
        lastSync: config.lastSync,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncError: config.lastSyncError,
        isConfigured: config.isConfigured,
        isProduction: config.isProduction,
        source: config.source,
        canEdit: config.canEdit
      });
    } catch (error) {
      return res.status(200).json({
        error: error.message,
        canEdit: true,
        source: 'error'
      });
    }
  }
  
  // POST - salvar configuração
  if (req.method === 'POST') {
    try {
      const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body || {};
      const updated = configService.setConfig({ baseUrl, email, token, jql, cacheTtlMinutes });
      
      return res.status(200).json({
        success: true,
        message: 'Configuração salva com sucesso!',
        config: updated
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
  
  // Método não permitido
  return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
}