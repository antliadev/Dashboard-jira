import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { baseUrl, email, token, jql } = req.body;
    
    // Configurar temporariamente para testar
    if (baseUrl || email || token || jql) {
      configService.setConfig({ baseUrl, email, token, jql });
    }
    
    const result = await jiraService.testConnection();
    
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