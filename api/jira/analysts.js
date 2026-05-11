/**
 * analysts.js — Retorna analistas distintos do banco
 */
import { fetchDashboardDataFromDatabase } from '../../lib/jiraService.js';
import { verifyAuth } from '../auth/verify.js';

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

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  // Verificar se Supabase está configurado
  const { isConfigured, supabase } = await getSupabaseStatus();
  
  if (!isConfigured || !supabase) {
    return res.status(200).json([]);
  }

  try {
    const data = await fetchDashboardDataFromDatabase();
    return res.status(200).json(data.analysts);
  } catch (error) {
    console.error('[analysts] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
