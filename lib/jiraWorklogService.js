import { checkSupabaseConfig, isConfigured, supabase } from './supabaseServer.js';

const WORKLOG_TABLE = 'jira_worklogs';
const CRAWFORD_PROJECT_KEY = 'CRAWFORD';
const PAGE_SIZE = 100;

function authHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

function adfToText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(adfToText).filter(Boolean).join(' ').trim();
  if (typeof value !== 'object') return '';
  if (value.type === 'text') return String(value.text || '');
  return adfToText(value.content || []);
}

export async function fetchIssueWorklogs(baseUrl, issueKey, email, token) {
  const rows = [];
  let startAt = 0;

  while (true) {
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?startAt=${startAt}&maxResults=${PAGE_SIZE}`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(email, token), Accept: 'application/json' },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`Falha ao buscar worklogs de ${issueKey} (${response.status}): ${detail.slice(0, 180)}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const page = Array.isArray(payload.worklogs) ? payload.worklogs : [];
    rows.push(...page);
    startAt += page.length;
    if (page.length === 0 || startAt >= Number(payload.total || 0)) break;
  }

  return rows;
}

function normalizeWorklog(worklog, issue, syncedAt) {
  const issueId = issue.id ?? issue.issue_id;
  const issueKey = issue.key ?? issue.issue_key;
  return {
    worklog_id: String(worklog.id),
    issue_id: String(issueId),
    issue_key: issueKey,
    project_key: CRAWFORD_PROJECT_KEY,
    author_account_id: worklog.author?.accountId || null,
    author_name: worklog.author?.displayName || 'Nao informado',
    description: adfToText(worklog.comment),
    started_at: worklog.started,
    time_spent_seconds: Math.max(0, Number(worklog.timeSpentSeconds) || 0),
    jira_created_at: worklog.created || null,
    jira_updated_at: worklog.updated || null,
    synced_at: syncedAt
  };
}

export async function fetchCrawfordWorklogsFromJira(issues, credentials) {
  const syncedAt = new Date().toISOString();
  const normalized = [];
  for (const issue of issues || []) {
    const issueKey = issue.key ?? issue.issue_key;
    if (!issueKey?.startsWith(`${CRAWFORD_PROJECT_KEY}-`)) continue;
    const worklogs = await fetchIssueWorklogs(
      credentials.baseUrl,
      issueKey,
      credentials.email,
      credentials.token
    );
    normalized.push(...worklogs.map(worklog => normalizeWorklog(worklog, issue, syncedAt)));
  }
  return normalized;
}

/**
 * Sincroniza somente os worklogs das issues Crawford presentes no resultado
 * global do Jira. O JQL global e a limpeza de jira_issues permanecem intactos.
 */
export async function syncCrawfordWorklogs(rawIssues, credentials, options = {}) {
  if (!isConfigured || !supabase) {
    const config = checkSupabaseConfig();
    throw new Error(config.error || 'Supabase nao configurado para salvar worklogs.');
  }

  const issues = (rawIssues || []).filter(issue => issue.fields?.project?.key === CRAWFORD_PROJECT_KEY);
  if (issues.length === 0) {
    await options.onProgress?.('Nenhuma issue Crawford no resultado; worklogs existentes foram preservados.');
    return { issues: 0, worklogs: 0, pruned: 0 };
  }

  const syncedAt = new Date().toISOString();
  const normalized = [];
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    const worklogs = await fetchIssueWorklogs(credentials.baseUrl, issue.key, credentials.email, credentials.token);
    normalized.push(...worklogs.map(worklog => normalizeWorklog(worklog, issue, syncedAt)));
    await options.onProgress?.(`Worklogs Crawford: ${index + 1}/${issues.length} tickets processados.`);
  }

  for (let index = 0; index < normalized.length; index += 500) {
    const { error } = await supabase
      .from(WORKLOG_TABLE)
      .upsert(normalized.slice(index, index + 500), { onConflict: 'worklog_id' });
    if (error) {
      throw new Error(`Erro ao salvar worklogs Crawford: ${error.message}. Execute sql/migration-hours-dashboard.sql.`);
    }
  }

  // Só remove registros antigos após todas as buscas e upserts terem sucesso.
  const issueKeys = issues.map(issue => issue.key);
  const { count, error: pruneError } = await supabase
    .from(WORKLOG_TABLE)
    .delete({ count: 'exact' })
    .eq('project_key', CRAWFORD_PROJECT_KEY)
    .in('issue_key', issueKeys)
    .lt('synced_at', syncedAt);
  if (pruneError) throw new Error(`Erro ao remover worklogs obsoletos: ${pruneError.message}`);

  return { issues: issues.length, worklogs: normalized.length, pruned: count || 0 };
}

