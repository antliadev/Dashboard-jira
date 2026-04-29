/**
 * api/jira/cache.js — Limpa cache/status de sync
 */
import { configService } from '../../lib/configService.js';
import { isConfigured, supabase } from '../../lib/supabaseServer.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    // Resetar status de sincronização no Supabase
    if (isConfigured && supabase) {
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
    }
    
    res.json({ success: true, message: 'Status de sincronização resetado com sucesso.' });
  } catch (error) {
    console.error('[cache] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}