import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}