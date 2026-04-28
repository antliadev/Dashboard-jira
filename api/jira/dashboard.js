import { fetchIssuesFromDatabase, buildDashboardData } from '../../lib/jiraService.js';
import { countIssuesInDatabase } from '../../lib/jiraService.js';
import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Garantir que não haja cache para refletir mudanças globais imediatamente
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const total = await countIssuesInDatabase();
    const config = await configService.getActiveConnection();

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
        lastSyncStatus: config?.lastSyncStatus || null,
        info: 'Nenhum dado no banco. Clique em "Sincronizar com Jira" para importar os tickets.'
      });
    }

    const issues = await fetchIssuesFromDatabase();
    const data   = buildDashboardData(issues);
    
    // Sobrescrever metadados de sync com os do banco para garantir consistência global
    return res.status(200).json({
      ...data,
      lastSyncedAt: config?.lastSync || data.lastSyncedAt,
      lastSyncStatus: config?.lastSyncStatus || 'success'
    });
  } catch (error) {
    console.error('[dashboard] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}