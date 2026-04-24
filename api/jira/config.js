import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  try {
    // Validar variáveis de ambiente em produção
    const envValidation = configService.validateEnvVars();
    
    if (!envValidation.valid) {
      return res.status(200).json({
        isConfigured: false,
        source: 'missing',
        message: envValidation.message,
        missing: envValidation.missing,
        isProduction: true,
        canEdit: false
      });
    }
    
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
        isProduction: config.isProduction,
        source: config.source,
        canEdit: config.canEdit
      });
    }
    
    // POST - salvar configuração
    if (req.method === 'POST') {
      // Em produção, retorna erro claro
      if (configService.getConfig().isProduction) {
        return res.status(403).json({
          success: false,
          message: 'Configuração em produção não pode ser alterada via API.',
          isProduction: true,
          canEdit: false,
          instructions: 'Configure JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN e JIRA_JQL nas variáveis de ambiente da Vercel.'
        });
      }
      
      const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body;
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