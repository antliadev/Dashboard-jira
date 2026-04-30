/**
 * api/jira/sync/status.js - Returns backend sync job status.
 */
import { verifyAuth } from '../../auth/verify.js';
import { getSyncJobStatus } from '../../../lib/syncJobService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo nao permitido. Use GET.' });
  }

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  try {
    const jobId = req.query?.jobId || null;
    const job = await getSyncJobStatus(jobId);

    if (!job) {
      return res.status(200).json({
        status: 'idle',
        lastSyncStatus: null,
        lastSync: null,
        lastSyncError: null,
        logs: []
      });
    }

    return res.status(200).json({
      ...job,
      lastSyncStatus: job.status,
      lastSync: job.finishedAt || job.startedAt || job.createdAt,
      lastSyncError: job.error
    });
  } catch (error) {
    console.error('[sync-status] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
