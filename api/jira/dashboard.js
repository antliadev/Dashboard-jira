import { fetchDashboardDataFromDatabase } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';
import { getSyncJobStatus } from '../../lib/syncJobService.js';
import { verifyAuth } from '../auth/verify.js';

// Lazy import para Supabase - evitar erro se não configurado
async function getSupabaseStatus() {
  try {
    const { isConfigured, supabase } = await import('../../lib/supabaseServer.js');
    return { isConfigured, supabase };
  } catch (e) {
    return { isConfigured: false, supabase: null };
  }
}

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar autenticação
  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  // Cache HTTP curto; invalidação real fica no cache de agregados do backend.
  res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');

  try {
    // Verificar se Supabase está configurado
    const { isConfigured, supabase } = await getSupabaseStatus();
    
    if (!isConfigured || !supabase) {
      return res.status(200).json({
        totalIssues: 0,
        totalProjects: 0,
        totalAnalysts: 0,
        issues: [],
        projects: [],
        analysts: [],
        statuses: [],
        metrics: {},
        board: { columns: [] },
        lastSyncedAt: null,
        lastSyncStatus: null,
        info: 'Supabase não configurado no servidor. Configure as variáveis de ambiente no Vercel.'
      });
    }

    const config = await configService.getActiveConnection();
    const latestJob = await getSyncJobStatus().catch(() => null);
    const data = await fetchDashboardDataFromDatabase();
    const total = data.totalIssues || 0;

    if (total === 0) {
      return res.status(200).json({
        totalIssues: 0,
        totalProjects: 0,
        totalAnalysts: 0,
        issues: [],
        projects: [],
        analysts: [],
        statuses: [],
        metrics: {},
        board: { columns: [] },
        lastSyncedAt: config?.lastSync || null,
        lastSyncStatus: latestJob?.status || config?.lastSyncStatus || null,
        syncJob: latestJob,
        info: 'Nenhum dado no banco. Clique em "Sincronizar com Jira" para importar os tickets.'
      });
    }

    // Sobrescrever metadados de sync com os do banco para garantir consistência global
    return res.status(200).json({
      ...data,
      lastSyncedAt: latestJob?.finishedAt || config?.lastSync || data.lastSyncedAt,
      lastSyncStatus: latestJob?.status || config?.lastSyncStatus || 'success',
      syncJob: latestJob
    });
  } catch (error) {
    console.error('[dashboard] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
