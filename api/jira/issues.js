/**
 * issues.js - Lista issues do banco com filtros e paginacao real.
 * Suporta filtros: project, status, assignee, priority, type.
 * Use all=true apenas quando uma tela precisar explicitamente da lista completa.
 */
import { fetchIssuesFromDatabase, fetchIssuesPageFromDatabase } from '../../lib/jiraService.js';
import { verifyAuth } from '../auth/verify.js';

async function getSupabaseStatus() {
  try {
    const { isConfigured, supabase } = await import('../../lib/supabaseServer.js');
    return { isConfigured, supabase };
  } catch {
    return { isConfigured: false, supabase: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  const { isConfigured, supabase } = await getSupabaseStatus();
  if (!isConfigured || !supabase) {
    return res.status(200).json({
      total: 0,
      limit: 100,
      offset: 0,
      issues: [],
      info: 'Supabase nao configurado no servidor.'
    });
  }

  try {
    const { project, status, assignee, priority, type } = req.query;
    const filters = { project, status, assignee, priority, type };

    if (req.query.all === 'true') {
      const issues = await fetchIssuesFromDatabase(filters);
      return res.status(200).json({
        total: issues.length,
        limit: issues.length,
        offset: 0,
        issues
      });
    }

    const page = await fetchIssuesPageFromDatabase(filters, {
      limit: req.query.limit,
      offset: req.query.offset
    });

    return res.status(200).json(page);
  } catch (error) {
    console.error('[issues] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
