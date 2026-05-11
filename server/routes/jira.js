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
import { checkSupabaseConfig, supabase, supabaseKeyIsPrivileged, supabaseKeySource, supabaseKeyType } from '../../lib/supabaseServer.js';
import {
  testJiraConnection,
  fetchIssuesFromDatabase,
  fetchIssuesPageFromDatabase,
  fetchDashboardDataFromDatabase,
  clearJiraDashboardCache
} from '../../lib/jiraService.js';
import { createSyncJob, getSyncJobStatus, runSyncJob } from '../../lib/syncJobService.js';

const router = express.Router();

router.get('/system/status', async (req, res) => {
  const supabaseConfig = checkSupabaseConfig();
  const latestJob = await getSyncJobStatus().catch(() => null);

  res.json({
    supabase: {
      configured: supabaseConfig.configured,
      keySource: supabaseKeySource,
      keyType: supabaseKeyType,
      privileged: supabaseKeyIsPrivileged,
      warning: supabaseKeyIsPrivileged
        ? null
        : 'Backend nao esta usando service_role/secret. Nao aplicar hardening RLS ainda.'
    },
    sync: {
      latestJobId: latestJob?.id || null,
      latestStatus: latestJob?.status || null,
      latestTotalIssues: latestJob?.totalIssues || 0,
      latestFinishedAt: latestJob?.finishedAt || null
    }
  });
});

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
    const job = await getSyncJobStatus(req.query?.jobId || null);

    if (!job) {
      return res.json({
        status: 'idle',
        lastSyncStatus: null,
        lastSync: null,
        lastSyncError: null,
        logs: []
      });
    }

    return res.json({
      ...job,
      lastSyncStatus: job.status,
      lastSync: job.finishedAt || job.startedAt || job.createdAt,
      lastSyncError: job.error
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
    const sessionId = req.headers['x-session-id'] || null;
    const { job, credentials, durable, credentialsPersisted } = await createSyncJob(req.body || {}, sessionId);

    setImmediate(() => {
      runSyncJob(job.id, credentials).catch(error => {
        console.error('[sync] Erro em background:', error.message);
      });
    });

    return res.status(202).json({
      success: true,
      message: 'Sincronizacao iniciada no backend.',
      jobId: job.id,
      job,
      durable,
      credentialsPersisted
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
    const latestJob = await getSyncJobStatus().catch(() => null);
    const data = await fetchDashboardDataFromDatabase();
    const total = data.totalIssues || 0;

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
        lastSyncedAt: latestJob?.finishedAt || null,
        lastSyncStatus: latestJob?.status || null,
        syncJob: latestJob,
        info: 'Nenhum dado no banco. Clique em "Sincronizar com Jira" para importar os tickets.'
      });
    }

    return res.json({
      ...data,
      lastSyncedAt: latestJob?.finishedAt || data.lastSyncedAt,
      lastSyncStatus: latestJob?.status || 'success',
      syncJob: latestJob
    });
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
    const filters = { project, status, assignee, priority, type };

    if (req.query.all === 'true') {
      const issues = await fetchIssuesFromDatabase(filters);
      return res.json({
        total: issues.length,
        limit: issues.length,
        offset: 0,
        issues
      });
    }

    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const page = await fetchIssuesPageFromDatabase(filters, { limit, offset });

    return res.json({
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      issues: page.issues
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
    const data = await fetchDashboardDataFromDatabase();
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
    const data = await fetchDashboardDataFromDatabase();
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
    const data = await fetchDashboardDataFromDatabase();
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
    const data = await fetchDashboardDataFromDatabase();
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
    const data = await fetchDashboardDataFromDatabase();
    return res.json(data.board);
  } catch (error) {
    console.error('[board] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/jira/cache/clear — Limpa cache/status de sync
// ─────────────────────────────────────────────
router.post('/cache/clear', async (req, res) => {
  try {
    clearJiraDashboardCache();
    // Resetar status de sincronização no Supabase
    const conn = await configService.getActiveConnection();
    if (conn && conn.id) {
      await supabase
        .from('jira_connections')
        .update({ 
          last_sync_status: null,
          last_sync_error: null,
          last_sync_at: null
        })
        .eq('id', conn.id);
    }
    res.json({ success: true, message: 'Status de sincronização resetado com sucesso.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/jira/cache/stats — Placeholder
// ─────────────────────────────────────────────
router.get('/cache/stats', (req, res) => {
  res.json({ hits: 0, misses: 0, keys: 0, message: 'Dados são lidos diretamente do banco.' });
});

export default router;
