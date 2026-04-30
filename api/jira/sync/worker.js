/**
 * api/jira/sync/worker.js - Protected backend worker for queued sync jobs.
 *
 * Configure CRON_SECRET in Vercel. Vercel Cron can call this endpoint without
 * the browser being open, allowing queued/stale jobs to finish or fail safely.
 */
import { runQueuedSyncJobs } from '../../../lib/syncJobService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido.' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Worker nao autorizado.' });
  }

  try {
    const result = await runQueuedSyncJobs(1);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[sync-worker] Erro:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
