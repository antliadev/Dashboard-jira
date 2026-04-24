import { configService } from '../../../lib/configService.js';

export default async function handler(req, res) {
  // Apenas GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido. Use GET.' });
  }

  try {
    const config = configService.getConfig();
    
    return res.status(200).json({
      isConfigured: config.isConfigured,
      hasToken: config.hasToken,
      lastSync: config.lastSync,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncError: config.lastSyncError
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}