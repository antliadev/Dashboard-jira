import { configService } from '../../lib/configService.js';
import { isConfigured } from '../../lib/supabaseServer.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Se tem Supabase, assume configurado
    if (isConfigured) {
      return res.status(200).json({
        isConfigured: true,
        hasToken: true,
        lastSync: null,
        lastSyncStatus: null,
        lastSyncError: null
      });
    }
    
    return res.status(200).json({
      isConfigured: false,
      lastSync: null,
      lastSyncStatus: null,
      lastSyncError: null
    });
  } catch (error) {
    return res.status(200).json({
      isConfigured: false,
      lastSync: null,
      lastSyncStatus: null,
      lastSyncError: error.message
    });
  }
}