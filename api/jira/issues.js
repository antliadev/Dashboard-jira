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
    const { issues } = data;
    
    let filtered = issues;
    
    if (req.query.project) {
      filtered = filtered.filter(i => i.project.key === req.query.project);
    }
    if (req.query.status) {
      filtered = filtered.filter(i => i.status.name === req.query.status);
    }
    if (req.query.assignee) {
      filtered = filtered.filter(i => i.assignee?.id === req.query.assignee);
    }
    if (req.query.priority) {
      filtered = filtered.filter(i => i.priority?.name === req.query.priority);
    }
    if (req.query.type) {
      filtered = filtered.filter(i => i.type.name === req.query.type);
    }
    
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    res.json({
      total: filtered.length,
      issues: filtered.slice(offset, offset + limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}