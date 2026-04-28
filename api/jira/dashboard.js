/**
 * dashboard.js — Lê issues do Supabase (nunca do Jira diretamente)
 * Agrega e retorna dados para o dashboard.
 */
import { fetchIssuesFromDatabase, buildDashboardData } from '../../lib/jiraService.js';
import { countIssuesInDatabase } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const total = await countIssuesInDatabase();

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
        info: 'Nenhum dado no banco. Clique em "Sincronizar com Jira" para importar os tickets.'
      });
    }

    const issues = await fetchIssuesFromDatabase();
    const data   = buildDashboardData(issues);
    return res.status(200).json(data);
  } catch (error) {
    console.error('[dashboard] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}