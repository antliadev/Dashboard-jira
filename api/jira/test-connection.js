import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { baseUrl, email, token, jql } = req.body;
    
    // Validar URLs
    if (baseUrl && !baseUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL deve começar com https://' });
    }
    
    // Testar com as credenciais fornecidas diretamente
    const result = await jiraService.testConnectionWithConfig(baseUrl, email, token, jql);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Conexão estabelecida com sucesso!',
        user: result.user,
        totalTickets: result.testResult.total
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}