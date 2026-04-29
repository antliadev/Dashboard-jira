/**
 * jiraRoutes.js — Rotas da API do Jira (desenvolvimento local)
 *
 * IMPORTANTE: Estas rotas reutilizam as mesmas funções do lib/
 * que são usadas pelas serverless functions em produção.
 * Isso garante comportamento idêntico entre dev e prod.
 *
 * Fluxo:
 *  - sync → busca Jira → upsert Supabase (via lib/jiraService)
 *  - dashboard/issues/etc → lê do Supabase (nunca do Jira diretamente)
 */
import express from 'express';
import { configService } from '../../lib/configService.js';
import {
  testJiraConnection,
  fetchAllIssuesFromJira,
  upsertIssuesToDatabase,
  fetchIssuesFromDatabase,
  countIssuesInDatabase,
  buildDashboardData
} from '../../lib/jiraService.js';

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/jira/config — Retorna configuração
// ─────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const conn = await configService.getActiveConnection();
    if (conn) {
      return res.json({
        isConfigured: true,
        source: 'supabase',
        baseUrl: conn.baseUrl,
        email: conn.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
        jql: conn.jql,
        cacheTtlMinutes: Math.floor((conn.cacheTtl || 600000) / 60000),
        hasToken: true,
        canEdit: true,
        isProduction: false
      });
    }

    // Sem conexão configurada
    return res.json({
      isConfigured: false,
      source: 'none',
      message: 'Nenhuma conexão Jira configurada.',
      canEdit: true,
      isProduction: false
    });
  } catch (error) {
    console.error('[config] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/jira/config — Salva configuração
// ─────────────────────────────────────────────
router.post('/config', async (req, res) => {
  try {
    const { baseUrl, email, token, jql, cacheTtlMinutes } = req.body;

    if (!baseUrl) return res.status(400).json({ error: 'URL é obrigatória' });
    if (!email)   return res.status(400).json({ error: 'Email é obrigatório' });
    if (!token)   return res.status(400).json({ error: 'Token é obrigatório' });

    const updated = await configService.setConfig({ baseUrl, email, token, jql, cacheTtlMinutes });

    return res.json({
      success: true,
      message: 'Configuração salva com sucesso!',
      ...updated
    });
  } catch (error) {
    console.error('[config] Erro ao salvar:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/jira/test-connection — Testa conexão
// ─────────────────────────────────────────────
router.post('/test-connection', async (req, res) => {
  try {
    console.log('[test-connection] Body recebido:', JSON.stringify(req.body));
    let { baseUrl, email, token, jql } = req.body;

    // Se não forneceu no body, buscar do Supabase
    if (!baseUrl || !email || !token) {
      const conn = await configService.getActiveConnection();
      if (conn) {
        baseUrl = baseUrl || conn.baseUrl;
        email   = email   || conn.email;
        token   = token   || conn.token;
        jql     = jql     || conn.jql;
      }
    }

    if (!baseUrl || !email || !token) {
      return res.status(400).json({ success: false, error: 'Credenciais incompletas. Configure na página Dados.' });
    }

    const result = await testJiraConnection(baseUrl, email, token, jql);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Conexão estabelecida com sucesso!',
        user: result.user,
        testResult: result.testResult
      });
    } else {
      return res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[test-connection] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/sync/status — Status da sincronização
// ─────────────────────────────────────────────
router.get('/sync/status', async (req, res) => {
  try {
    const conn = await configService.getActiveConnection();
    const total = await countIssuesInDatabase();

    return res.json({
      isConfigured: !!conn,
      hasToken: !!conn,
      totalIssuesInDb: total,
      lastSync: null,
      lastSyncStatus: null,
      lastSyncError: null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/jira/sync — Sincroniza Jira → Supabase
// ─────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    let { baseUrl, email, token, jql } = req.body || {};

    // Buscar credenciais do Supabase se não fornecidas
    if (!baseUrl || !email || !token) {
      const conn = await configService.getActiveConnection();
      if (!conn) {
        return res.status(400).json({
          success: false,
          error: 'Credenciais não configuradas. Acesse a página Dados e configure a conexão com o Jira.'
        });
      }
      baseUrl = baseUrl || conn.baseUrl;
      email   = email   || conn.email;
      token   = token   || conn.token;
      jql     = jql     || conn.jql;
    }

    // Sanitizar
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    email   = email.trim();
    token   = token.trim();
    const effectiveJql = jql?.trim() ||
      'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY updated DESC';

    console.log('[sync] Iniciando sincronização...');

    // 1) Buscar issues do Jira com paginação
    const rawIssues = await fetchAllIssuesFromJira(baseUrl, email, token, effectiveJql);

    if (rawIssues.length === 0) {
      return res.json({
        success: true,
        warning: 'Nenhum ticket retornado pelo Jira. Verifique se a JQL está correta.',
        totalIssues: 0,
        inserted: 0,
        updated: 0
      });
    }

    // 2) Upsert no Supabase (sem duplicatas)
    const dbResult = await upsertIssuesToDatabase(rawIssues);

    console.log(`[sync] Concluído. Total: ${dbResult.total} | Novos: ~${dbResult.inserted} | Atualizados: ~${dbResult.updated}`);

    // 3) Retornar resumo
    return res.json({
      success: true,
      lastSyncedAt: new Date().toISOString(),
      totalIssues: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      preview: rawIssues.slice(0, 5).map(i => ({
        key: i.key,
        title: i.fields?.summary,
        project: i.fields?.project?.key,
        status: i.fields?.status?.name,
        assignee: i.fields?.assignee?.displayName || 'Não atribuído'
      }))
    });
  } catch (error) {
    console.error('[sync] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/dashboard — Dados agregados do banco
// ─────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const total = await countIssuesInDatabase();

    if (total === 0) {
      return res.json({
        totalIssues: 0,
        totalProjects: 0,
        totalAnalysts: 0,
        issues: [],
        projects: [],
        analysts: [],
        statuses: [],
        metrics: {},
        board: { columns: [] },
        info: 'Nenhum dado no banco. Clique em "Sincronizar com Jira" para importar os tickets.'
      });
    }

    const issues = await fetchIssuesFromDatabase();
    const data = buildDashboardData(issues);
    return res.json(data);
  } catch (error) {
    console.error('[dashboard] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/issues — Lista issues com filtros (do banco)
// ─────────────────────────────────────────────
router.get('/issues', async (req, res) => {
  try {
    const { project, status, assignee, priority, type } = req.query;
    const issues = await fetchIssuesFromDatabase({ project, status, assignee, priority, type });

    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const paginated = issues.slice(offset, offset + limit);

    return res.json({
      total: issues.length,
      limit,
      offset,
      issues: paginated
    });
  } catch (error) {
    console.error('[issues] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/projects — Projetos do banco
// ─────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) return res.json([]);
    const data = buildDashboardData(issues);
    return res.json(data.projects);
  } catch (error) {
    console.error('[projects] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/analysts — Analistas do banco
// ─────────────────────────────────────────────
router.get('/analysts', async (req, res) => {
  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) return res.json([]);
    const data = buildDashboardData(issues);
    return res.json(data.analysts);
  } catch (error) {
    console.error('[analysts] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/statuses — Status do banco
// ─────────────────────────────────────────────
router.get('/statuses', async (req, res) => {
  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) return res.json([]);
    const data = buildDashboardData(issues);
    return res.json(data.statuses);
  } catch (error) {
    console.error('[statuses] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/metrics — Métricas do banco
// ─────────────────────────────────────────────
router.get('/metrics', async (req, res) => {
  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) return res.json({});
    const data = buildDashboardData(issues);
    return res.json(data.metrics);
  } catch (error) {
    console.error('[metrics] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/board — Board Kanban do banco
// ─────────────────────────────────────────────
router.get('/board', async (req, res) => {
  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) return res.json({ columns: [] });
    const data = buildDashboardData(issues);
    return res.json(data.board);
  } catch (error) {
    console.error('[board] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/jira/cache/clear — Placeholder (sem cache em memória)
// ─────────────────────────────────────────────
router.post('/cache/clear', (req, res) => {
  res.json({ message: 'Cache não utilizado. Dados são lidos diretamente do banco.' });
});

// ─────────────────────────────────────────────
// GET /api/jira/cache/stats — Placeholder
// ─────────────────────────────────────────────
router.get('/cache/stats', (req, res) => {
  res.json({ hits: 0, misses: 0, keys: 0, message: 'Dados são lidos diretamente do banco.' });
});

export default router;
