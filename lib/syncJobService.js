/**
 * syncJobService.js - Background jobs for Jira import.
 *
 * Credentials are accepted for a single sync run only. When Supabase is
 * available, the API token is encrypted temporarily so a backend worker can
 * finish or recover the job without depending on the browser tab.
 */
import crypto from 'crypto';
import { isConfigured, supabase, checkSupabaseConfig, supabaseKeyIsPrivileged } from './supabaseServer.js';
import { encrypt, decrypt } from './encryption.js';
import { fetchAllIssuesFromJira, upsertIssuesToDatabase } from './jiraService.js';

const JOB_TABLE = 'jira_sync_jobs';
const ACTIVE_STATUSES = ['queued', 'running'];
const DEFAULT_JQL = 'project is not EMPTY ORDER BY updated DESC';
const memoryJobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
}

function maskEmail(email = '') {
  const [name, domain] = email.split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function cleanError(error) {
  const message = error?.message || String(error || 'Erro desconhecido');
  return message.replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [redacted]').slice(0, 600);
}

function canPersistJobCredentials() {
  return supabaseKeyIsPrivileged;
}

function assertDatabaseReady() {
  const config = checkSupabaseConfig();
  if (!config.configured || !supabase) {
    throw new Error(config.error || 'Supabase nao configurado. A sincronizacao precisa do banco para persistir os tickets.');
  }
}

function normalizeCredentials({ baseUrl, email, token, jql }) {
  const cleanBaseUrl = (baseUrl || '').trim().toLowerCase().replace(/\/$/, '');
  const cleanEmail = (email || '').trim();
  const cleanToken = (token || '').trim();
  const effectiveJql = (jql || '').trim() || DEFAULT_JQL;

  if (!cleanBaseUrl) throw new Error('Base URL do Jira e obrigatoria.');
  if (!cleanEmail) throw new Error('E-mail do Jira e obrigatorio.');
  if (!cleanToken) throw new Error('API Token do Jira e obrigatorio.');
  if (!cleanEmail.includes('@')) throw new Error('E-mail do Jira invalido.');
  if (!cleanBaseUrl.startsWith('https://')) {
    throw new Error('Base URL deve comecar com https://.');
  }

  return { baseUrl: cleanBaseUrl, email: cleanEmail, token: cleanToken, jql: effectiveJql };
}

function toPublicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    baseUrl: job.base_url || job.baseUrl,
    emailMasked: job.email_masked || job.emailMasked,
    totalIssues: job.total_issues ?? job.totalIssues ?? 0,
    inserted: job.inserted_count ?? job.inserted ?? 0,
    updated: job.updated_count ?? job.updated ?? 0,
    error: job.error_message || job.error || null,
    logs: job.logs || [],
    startedAt: job.started_at || job.startedAt || null,
    finishedAt: job.finished_at || job.finishedAt || null,
    createdAt: job.created_at || job.createdAt || null,
    updatedAt: job.updated_at || job.updatedAt || null
  };
}

function getMemoryLatestJob() {
  return [...memoryJobs.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function getMemoryActiveJob() {
  return [...memoryJobs.values()]
    .find(job => ACTIVE_STATUSES.includes(job.status)) || null;
}

async function getSupabaseLatestJob() {
  if (!isConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[sync-job] Nao foi possivel buscar ultimo job:', error.message);
    return null;
  }

  return data || null;
}

async function getSupabaseJob(jobId) {
  if (!isConfigured || !supabase || !jobId) return null;

  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    console.warn('[sync-job] Nao foi possivel buscar job:', error.message);
    return null;
  }

  return data || null;
}

async function getSupabaseActiveJob() {
  if (!isConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select('*')
    .in('status', ACTIVE_STATUSES)
    .gt('expires_at', nowIso())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[sync-job] Nao foi possivel buscar job ativo:', error.message);
    return null;
  }

  return data || null;
}

async function patchSupabaseJob(jobId, patch) {
  if (!isConfigured || !supabase) return false;

  const { error } = await supabase
    .from(JOB_TABLE)
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', jobId);

  if (error) {
    console.warn('[sync-job] Falha ao atualizar job:', error.message);
    return false;
  }

  return true;
}

function patchMemoryJob(jobId, patch) {
  const job = memoryJobs.get(jobId);
  if (!job) return false;
  const next = { ...job, ...patch, updatedAt: nowIso() };
  if (next.status === 'success' || next.status === 'error') {
    delete next.credentials;
  }
  memoryJobs.set(jobId, next);
  return true;
}

async function patchJob(jobId, patch) {
  const dbPatch = {};
  if ('status' in patch) dbPatch.status = patch.status;
  if ('totalIssues' in patch) dbPatch.total_issues = patch.totalIssues;
  if ('inserted' in patch) dbPatch.inserted_count = patch.inserted;
  if ('updated' in patch) dbPatch.updated_count = patch.updated;
  if ('error' in patch) dbPatch.error_message = patch.error;
  if ('logs' in patch) dbPatch.logs = patch.logs;
  if ('startedAt' in patch) dbPatch.started_at = patch.startedAt;
  if ('finishedAt' in patch) dbPatch.finished_at = patch.finishedAt;
  if ('tokenEncrypted' in patch) dbPatch.api_token_encrypted = patch.tokenEncrypted;
  if ('emailEncrypted' in patch) dbPatch.email_encrypted = patch.emailEncrypted;

  const dbUpdated = Object.keys(dbPatch).length
    ? await patchSupabaseJob(jobId, dbPatch)
    : false;
  const memoryUpdated = patchMemoryJob(jobId, patch);
  return dbUpdated || memoryUpdated;
}

async function readJob(jobId) {
  const dbJob = await getSupabaseJob(jobId);
  if (dbJob) return dbJob;
  return memoryJobs.get(jobId) || null;
}

async function appendLog(jobId, message) {
  const publicMessage = String(message).slice(0, 400);
  const job = await readJob(jobId);
  const currentLogs = Array.isArray(job?.logs) ? job.logs : [];
  const logs = [
    ...currentLogs,
    { at: nowIso(), message: publicMessage }
  ].slice(-80);

  await patchJob(jobId, { logs });
  console.log(`[sync-job:${jobId}] ${publicMessage}`);
}

export async function getSyncJobStatus(jobId = null) {
  const job = jobId
    ? await readJob(jobId)
    : (await getSupabaseLatestJob()) || getMemoryLatestJob();

  return toPublicJob(job);
}

export async function createSyncJob(input, sessionId = null) {
  assertDatabaseReady();
  const credentials = normalizeCredentials(input);
  const active = (await getSupabaseActiveJob()) || getMemoryActiveJob();

  if (active) {
    const publicJob = toPublicJob(active);
    const error = new Error('Ja existe uma sincronizacao em andamento.');
    error.code = 'SYNC_ALREADY_RUNNING';
    error.job = publicJob;
    throw error;
  }

  const id = crypto.randomUUID();
  const baseJob = {
    id,
    status: 'queued',
    baseUrl: credentials.baseUrl,
    emailMasked: maskEmail(credentials.email),
    totalIssues: 0,
    inserted: 0,
    updated: 0,
    error: null,
    logs: [{ at: nowIso(), message: 'Sincronizacao enfileirada no backend.' }],
    startedAt: null,
    finishedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: expiresIso(),
    credentials
  };

  let storedInDatabase = false;
  if (isConfigured && supabase) {
    const shouldPersistCredentials = canPersistJobCredentials();
    const { error } = await supabase.from(JOB_TABLE).insert({
      id,
      status: 'queued',
      base_url: credentials.baseUrl,
      email_masked: maskEmail(credentials.email),
      email_encrypted: shouldPersistCredentials ? encrypt(credentials.email) : null,
      api_token_encrypted: shouldPersistCredentials ? encrypt(credentials.token) : null,
      jql: credentials.jql,
      logs: baseJob.logs,
      expires_at: baseJob.expiresAt,
      created_by_session: sessionId || null
    });

    if (error) {
      throw new Error(`Nao foi possivel criar o job de sincronizacao. Verifique a migracao jira_sync_jobs. Detalhe: ${error.message}`);
    }
    storedInDatabase = true;
  }

  memoryJobs.set(id, baseJob);

  return {
    job: toPublicJob(baseJob),
    credentials,
    durable: storedInDatabase,
    credentialsPersisted: storedInDatabase && canPersistJobCredentials()
  };
}

async function resolveCredentials(jobId, credentials) {
  if (credentials?.token) return credentials;

  const job = await getSupabaseJob(jobId);
  if (!job?.api_token_encrypted) {
    throw new Error('Credenciais temporarias nao estao mais disponiveis para este job.');
  }

  return {
    baseUrl: job.base_url,
    email: decrypt(job.email_encrypted),
    token: decrypt(job.api_token_encrypted),
    jql: job.jql || DEFAULT_JQL
  };
}

export async function runSyncJob(jobId, credentials = null) {
  const startedAt = nowIso();

  try {
    const current = await readJob(jobId);
    if (!current) throw new Error('Job de sincronizacao nao encontrado.');
    if (current.status === 'success' || current.status === 'error') return toPublicJob(current);

    const resolved = await resolveCredentials(jobId, credentials || current.credentials);
    const safeCredentials = normalizeCredentials(resolved);

    await patchJob(jobId, { status: 'running', startedAt, error: null });
    await appendLog(jobId, 'Processamento iniciado no backend.');
    await appendLog(jobId, `Buscando tickets no Jira em ${safeCredentials.baseUrl}.`);
    await appendLog(jobId, `Filtro Jira usado: ${safeCredentials.jql || 'todos os tickets visiveis'}.`);

    const rawIssues = await fetchAllIssuesFromJira(
      safeCredentials.baseUrl,
      safeCredentials.email,
      safeCredentials.token,
      safeCredentials.jql,
      {
        onProgress: (message) => appendLog(jobId, message)
      }
    );

    await appendLog(jobId, `${rawIssues.length} tickets recebidos do Jira.`);
    if (rawIssues.length === 0) {
      throw new Error('Filtro Jira retornou 0 tickets. A sincronizacao nao foi concluida para evitar sucesso falso; verifique filtro, permissao do usuario e credenciais informadas.');
    }

    await appendLog(jobId, 'Salvando tickets no Supabase.');
    const dbResult = await upsertIssuesToDatabase(rawIssues, {
      baseUrl: safeCredentials.baseUrl,
      onProgress: (message) => appendLog(jobId, message)
    });

    await patchJob(jobId, {
      status: 'success',
      totalIssues: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      finishedAt: nowIso(),
      tokenEncrypted: null,
      emailEncrypted: null
    });
    await appendLog(jobId, 'Sincronizacao concluida com sucesso.');

    return await getSyncJobStatus(jobId);
  } catch (error) {
    const message = cleanError(error);
    await patchJob(jobId, {
      status: 'error',
      error: message,
      finishedAt: nowIso(),
      tokenEncrypted: null,
      emailEncrypted: null
    });
    await appendLog(jobId, `Erro tratado: ${message}`);
    return await getSyncJobStatus(jobId);
  }
}

export async function runQueuedSyncJobs(limit = 1) {
  if (!isConfigured || !supabase) {
    return { processed: 0, message: 'Supabase nao configurado.' };
  }

  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select('*')
    .or(`status.eq.queued,and(status.eq.running,updated_at.lt.${staleCutoff})`)
    .gt('expires_at', nowIso())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Erro ao buscar jobs pendentes: ${error.message}`);
  }

  for (const job of data || []) {
    await runSyncJob(job.id);
  }

  return { processed: (data || []).length };
}
