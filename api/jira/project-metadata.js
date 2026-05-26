import { verifyAuth } from '../auth/verify.js';
import {
  listProjectMetadata,
  upsertProjectMetadata,
} from '../../lib/projectMetadataService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  try {
    if (req.method === 'GET') {
      const projectKey = req.query?.projectKey || null;
      const result = await listProjectMetadata(projectKey);
      return res.status(200).json(result);
    }

    if (req.method === 'PATCH' || req.method === 'POST' || req.method === 'PUT') {
      const result = await upsertProjectMetadata(req.body || {});
      return res.status(result.persistence === 'supabase' ? 200 : 202).json(result);
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (error) {
    console.error('[project-metadata] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
