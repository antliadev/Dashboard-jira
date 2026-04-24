import { jiraService } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    let { baseUrl, email, token, jql } = req.body || {};
    
    // Sanitizar
    baseUrl = baseUrl?.trim()?.replace(/\/$/, '') || '';
    email = email?.trim() || '';
    token = token?.trim() || '';
    jql = jql?.trim();
    
    // Validar credenciais
    if (!baseUrl) {
      return res.status(400).json({ success: false, error: 'URL é obrigatória' });
    }
    if (!baseUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL deve começar com https://' });
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