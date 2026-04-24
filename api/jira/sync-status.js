import { configService } from '../../lib/configService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const config = configService.getConfig();
    res.json({
      isConfigured: config.isConfigured,
      hasToken: config.hasToken,
      lastSync: config.lastSync,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncError: config.lastSyncError
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}