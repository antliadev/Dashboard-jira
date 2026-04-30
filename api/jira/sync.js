/**
 * api/jira/sync.js - Starts a backend Jira sync job.
 */
import { verifyAuth } from '../auth/verify.js';
import { createSyncJob, runSyncJob } from '../../lib/syncJobService.js';
import { waitUntil } from '@vercel/functions';

async function scheduleBackground(work, context) {
  if (context?.waitUntil) {
    context.waitUntil(work());
    return 'context.waitUntil';
  }

  if (typeof waitUntil === 'function') {
    waitUntil(work());
    return '@vercel/functions.waitUntil';
  }

  setImmediate(work);
  return 'setImmediate';
}

export default async function handler(req, res, context) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido. Use POST.' });
  }

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  try {
    const sessionId = req.headers['x-session-id'] || null;
    const { job, credentials, durable, credentialsPersisted } = await createSyncJob(req.body || {}, sessionId);
    const scheduler = await scheduleBackground(
      () => runSyncJob(job.id, credentials),
      context
    );

    return res.status(202).json({
      success: true,
      message: 'Sincronizacao iniciada no backend.',
      jobId: job.id,
      job,
      durable,
      credentialsPersisted,
      scheduler
    });
  } catch (error) {
    if (error.code === 'SYNC_ALREADY_RUNNING') {
      return res.status(409).json({
        success: false,
        error: error.message,
        jobId: error.job?.id,
        job: error.job
      });
    }

    console.error('[sync] Erro ao iniciar job:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
}
