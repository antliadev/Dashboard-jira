import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Aceita credenciais no corpo da requisição ou usa configService
    const { baseUrl, email, token, jql } = req.body;
    
    configService.updateSyncStatus('running');
    
    // Busca dados usando credenciais fornecidas ou do configService
    const data = await jiraService.fetchAllIssuesWithConfig(baseUrl, email, token, jql);
    
    configService.updateSyncStatus('success');
    
    res.json({
      success: true,
      lastSyncedAt: data.lastSyncedAt,
      totalIssues: data.totalIssues,
      totalProjects: data.totalProjects,
      totalAnalysts: data.totalAnalysts,
      totalStatuses: data.statuses.length,
      preview: data.issues.slice(0, 5).map(i => ({
        key: i.key,
        title: i.title,
        project: i.project.key,
        status: i.status.name,
        assignee: i.assignee?.name || 'Não atribuído'
      }))
    });
  } catch (error) {
    configService.updateSyncStatus('error', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}