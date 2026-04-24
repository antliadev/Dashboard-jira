import { jiraService } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

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
    
    // Precisamos de credenciais
    if (!baseUrl || !email || !token) {
      const cfg = configService.getConfig();
      baseUrl = baseUrl || cfg.baseUrl;
      email = email || cfg.fullEmail || cfg.email;
      token = token || cfg.token;
    }
    
    if (!baseUrl || !email || !token) {
      return res.status(400).json({ 
        error: 'Credenciais não fornecidas' 
      });
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