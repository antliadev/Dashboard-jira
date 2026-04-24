import { configService } from '../../lib/configService.js';
import { jiraService } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    let { baseUrl, email, token, jql } = req.body || {};
    
    // Se não fornecer, buscar do Supabase
    if (!baseUrl || !email || !token) {
      const conn = await configService.getActiveConnection();
      if (conn) {
        baseUrl = conn.baseUrl;
        email = conn.email;
        token = conn.token;
        jql = jql || conn.jql;
      }
    }
    
    // Validar
    if (!baseUrl) {
      return res.status(400).json({ success: false, error: 'Configure o Jira primeiro na página Dados.' });
    }
    if (!baseUrl.startsWith('https://')) {
      baseUrl = baseUrl.replace(/\/$/, '');
      baseUrl = 'https://' + baseUrl.replace(/^https?:\/\//, '');
    }
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório' });
    }
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token é obrigatório' });
    }
    
    // Testar conexão
    const result = await jiraService.testConnectionWithConfig(baseUrl, email, token, jql);
    
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Conexão estabelecida com sucesso!',
        user: result.user,
        testResult: result.testResult
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}