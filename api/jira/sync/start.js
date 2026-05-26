/**
 * api/jira/sync/start.js - Starts a backend Jira sync job using only env vars.
 *
 * Unlike api/jira/sync.js, this endpoint does NOT accept credentials in the
 * request body — it reads JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN and
 * JIRA_JQL from environment variables only.
 */
import { verifyAuth } from '../../auth/verify.js';
import { createSyncJobFromEnv, runSyncJob } from '../../../lib/syncJobService.js';
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
    const { job, credentials, durable, credentialsPersisted } = await createSyncJobFromEnv(sessionId);
    const scheduler = await scheduleBackground(
      () => runSyncJob(job.id, credentials),
      context
    );

    return res.status(202).json({
      success: true,
      message: 'Sincronizacao iniciada no backend (env vars).',
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
        code: 'SYNC_ALREADY_RUNNING',
        jobId: error.job?.id,
        job: error.job
      });
    }

    console.error('[sync/start] Erro ao iniciar job:', error.message);
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
}
