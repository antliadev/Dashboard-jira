import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

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
    
    if (!baseUrl || !email || !token) {
      return res.status(400).json({ error: 'Credenciais não configuradas. Configure na página Dados.' });
    }
    
    configService.updateSyncStatus('running');
    
    const data = await jiraService.fetchAllIssuesWithConfig(baseUrl, email, token, jql);
    
    configService.updateSyncStatus('success');
    
    return res.status(200).json({
      success: true,
      lastSyncedAt: data.lastSyncedAt,
      totalIssues: data.totalIssues,
      totalProjects: data.totalProjects,
      totalAnalysts: data.totalAnalysts,
      totalStatuses: data.statuses?.length || 0,
      preview: data.issues?.slice(0, 5).map(i => ({
        key: i.key,
        title: i.title,
        project: i.project.key,
        status: i.status.name,
        assignee: i.assignee?.name || 'Não atribuído'
      })) || []
    });
  } catch (error) {
    configService.updateSyncStatus('error', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}