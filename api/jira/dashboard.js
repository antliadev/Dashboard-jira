import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Buscar conexão do Supabase
    const conn = await configService.getActiveConnection();
    
    if (!conn) {
      return res.status(400).json({ 
        error: 'Jira não configurado. Configure as credenciais na página Dados.' 
      });
    }
    
    // Buscar dados do Jira
    const data = await jiraService.fetchAllIssuesWithConfig(
      conn.baseUrl,
      conn.email,
      conn.token,
      conn.jql
    );
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}