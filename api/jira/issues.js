/**
 * issues.js — Lista issues do banco (não do Jira)
 * Suporta filtros: project, status, assignee, priority, type
 */
import { fetchIssuesFromDatabase } from '../../lib/jiraService.js';

// Lazy import para Supabase
async function getSupabaseStatus() {
  try {
    const { isConfigured, supabase } = await import('../../lib/supabaseServer.js');
    return { isConfigured, supabase };
  } catch (e) {
    return { isConfigured: false, supabase: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar se Supabase está configurado
  const { isConfigured, supabase } = await getSupabaseStatus();
  
  if (!isConfigured || !supabase) {
    return res.status(200).json({
      total: 0,
      limit: 100,
      offset: 0,
      issues: [],
      info: 'Supabase não configurado no servidor.'
    });
  }

  try {
    const { project, status, assignee, priority, type } = req.query;

    const issues = await fetchIssuesFromDatabase({ project, status, assignee, priority, type });

    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const paginated = issues.slice(offset, offset + limit);

    return res.status(200).json({
      total: issues.length,
      limit,
      offset,
      issues: paginated
    });
  } catch (error) {
    console.error('[issues] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}