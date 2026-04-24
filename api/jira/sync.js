import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ 
        error: 'Jira não configurado. Configure as credenciais primeiro.' 
      });
    }

    configService.updateSyncStatus('running');
    
    const data = await jiraService.fetchAllIssues();
    
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