import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  try {
    // Validar variáveis de ambiente em produção
    const envValidation = configService.validateEnvVars();
    const config = configService.getConfig();
    
    // GET - retorna configuração
    if (req.method === 'GET') {
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
      // Verificar se está bloqueado
      if (!config.canEdit) {
        return res.status(403).json({
          success: false,
          message: 'Configuração bloqueada. Defina JIRA_LOCK_CONFIG=0 para habilitar edição.',
          isProduction: config.isProduction,
          canEdit: false
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