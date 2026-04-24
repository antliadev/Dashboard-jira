import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  try {
    // GET - retorna configuração
    if (req.method === 'GET') {
      const config = configService.getConfig();
      
      return res.status(200).json({
        baseUrl: config.baseUrl,
        email: config.email,
        jql: config.jql,
        cacheTtlMinutes: config.cacheTtlMinutes,
        hasToken: config.hasToken,
        lastSync: config.lastSync,
        lastSyncStatus: config.lastSyncStatus,
        lastSyncError: config.lastSyncError,
        isConfigured: config.isConfigured,
        isProduction: config.isProduction
      });
    }
    
    // POST - salvar configuração
    if (req.method === 'POST') {
      const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body;
      
      // Verificar se é produção
      if (configService.getConfig().isProduction) {
        return res.status(200).json({
          success: false,
          message: 'Em produção, configure o Jira pelas Environment Variables da Vercel.'
        });
      }
      
      // Em desenvolvimento, salvar configuração
      const updated = configService.setConfig({ baseUrl, email, token, jql, cacheTtlMinutes });
      
      return res.status(200).json({
        success: true,
        message: 'Configuração salva com sucesso!',
        config: updated
      });
    }
    
    // Método não permitido
    return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}