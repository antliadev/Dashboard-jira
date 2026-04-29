/**
 * projects.js — Retorna projetos distintos do banco
 */
import { fetchIssuesFromDatabase, buildDashboardData } from '../../lib/jiraService.js';

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
    return res.status(200).json([]);
  }

  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) {
      return res.status(200).json([]);
    }
    const data = buildDashboardData(issues);
    return res.status(200).json(data.projects);
  } catch (error) {
    console.error('[projects] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}