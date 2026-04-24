import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  // GET - retorna configuração
  if (req.method === 'GET') {
    try {
      const config = configService.getConfig();
      // Pegar email completo diretamente do configService
      const fullEmail = config.fullEmail || config.email;
      
      return res.status(200).json({
        baseUrl: config.baseUrl,
        email: fullEmail,  // Sempre retorna email completo
        fullEmail: fullEmail,
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
      
      // Retornar email completo
      const fullEmail = updated.fullEmail || email;
      
      return res.status(200).json({
        success: true,
        message: 'Configuração salva com sucesso!',
        baseUrl: updated.baseUrl,
        email: fullEmail,  // Sempre retorna email completo
        token: updated.token,
        jql: updated.jql,
        isConfigured: updated.isConfigured,
        source: updated.source,
        canEdit: updated.canEdit
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