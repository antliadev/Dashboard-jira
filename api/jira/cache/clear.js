/**
 * api/jira/cache/clear.js - Limpa cache de leitura/status de sync.
 */
import { configService } from '../../../lib/configService.js';
import { isConfigured, supabase } from '../../../lib/supabaseServer.js';
import { clearJiraDashboardCache } from '../../../lib/jiraService.js';
import { verifyAuth } from '../../auth/verify.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido. Use POST.' });
  }

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  try {
    clearJiraDashboardCache();

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

    return res.json({ success: true, message: 'Cache/status de sincronizacao resetado com sucesso.' });
  } catch (error) {
    console.error('[cache] Erro:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
