import { verifyAuth } from '../../auth/verify.js';
import { checkSupabaseConfig, supabaseKeyIsPrivileged, supabaseKeySource, supabaseKeyType } from '../../../lib/supabaseServer.js';
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

  const supabaseConfig = checkSupabaseConfig();
  const latestJob = await getSyncJobStatus().catch(() => null);

  return res.status(200).json({
    supabase: {
      configured: supabaseConfig.configured,
      keySource: supabaseKeySource,
      keyType: supabaseKeyType,
      privileged: supabaseKeyIsPrivileged,
      warning: supabaseKeyIsPrivileged
        ? null
        : 'Backend nao esta usando service_role/secret. Nao aplicar hardening RLS ainda.'
    },
    sync: {
      latestJobId: latestJob?.id || null,
      latestStatus: latestJob?.status || null,
      latestTotalIssues: latestJob?.totalIssues || 0,
      latestFinishedAt: latestJob?.finishedAt || null
    }
  });
}
