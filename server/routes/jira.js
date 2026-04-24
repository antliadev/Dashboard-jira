/**
 * jiraRoutes.js — Rotas da API do Jira
 */
import express from 'express';
import { jiraService } from '../services/jiraService.js';
import { configService } from '../services/configService.js';

const router = express.Router();

router.get('/config', (req, res) => {
  try {
    const config = configService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/config', (req, res) => {
  try {
    const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body;
    
    // Validar URL antes de salvar
    if (baseUrl) {
      if (!baseUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'URL deve começar com https://' });
      }
      if (!baseUrl.includes('.atlassian.net')) {
        return res.status(400).json({ error: 'URL deve ser um domínio do Jira (.atlassian.net)' });
      }
    }
    
    const updatedConfig = configService.setConfig({
      baseUrl,
      email,
      token,
      jql,
      cacheTtlMinutes
    });
    
    // Recarregar cache com novo TTL se changed
    if (cacheTtlMinutes) {
      jiraService.reloadCache();
    }
    
    res.json(updatedConfig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/test-connection', async (req, res) => {
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
});

router.get('/sync/status', (req, res) => {
  try {
    const config = configService.getConfig();
    res.json({
      isConfigured: config.isConfigured,
      hasToken: config.hasToken,
      lastSync: config.lastSync,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncError: config.lastSyncError
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
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
});

router.get('/dashboard', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ 
        error: 'Jira não configurado. Configure as credenciais na página Dados.' 
      });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/issues', async (req, res, next) => {
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
    next(error);
  }
});

router.get('/projects', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.projects);
  } catch (error) {
    next(error);
  }
});

router.get('/analysts', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.analysts);
  } catch (error) {
    next(error);
  }
});

router.get('/statuses', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.statuses);
  } catch (error) {
    next(error);
  }
});

router.get('/metrics', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.metrics);
  } catch (error) {
    next(error);
  }
});

router.get('/board', async (req, res, next) => {
  try {
    if (!configService.isConfigured()) {
      return res.status(400).json({ error: 'Jira não configurado' });
    }
    
    const data = await jiraService.fetchAllIssues();
    res.json(data.board);
  } catch (error) {
    next(error);
  }
});

router.post('/cache/clear', (req, res) => {
  try {
    const result = jiraService.clearCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cache/stats', (req, res) => {
  try {
    const stats = jiraService.getCacheStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;