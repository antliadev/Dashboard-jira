/**
 * jiraService.js — Integração Jira + Supabase
 *
 * Fluxo:
 *  1) sync → busca do Jira → upsert no Supabase (por issue_id)
 *  2) dashboard/issues/etc → lê do Supabase (nunca do Jira diretamente)
 */
import { supabase, isConfigured } from './supabaseServer.js';

const JIRA_FIELDS = [
  'summary', 'status', 'assignee', 'reporter', 'creator',
  'project', 'issuetype', 'priority', 'created', 'updated',
  'resolutiondate', 'labels', 'components', 'fixVersions', 'parent'
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeAuthHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

function normalizeIssue(raw) {
  const f = raw.fields || {};
  return {
    issue_id:        raw.id,
    issue_key:       raw.key,
    title:           f.summary || '',
    status_id:       f.status?.id || null,
    status_name:     f.status?.name || 'Unknown',
    status_category: f.status?.statusCategory?.name || null,
    project_id:      f.project?.id || null,
    project_key:     f.project?.key || '',
    project_name:    f.project?.name || '',
    project_avatar:  f.project?.avatarUrls?.['48x48'] || null,
    type_id:         f.issuetype?.id || null,
    type_name:       f.issuetype?.name || 'Task',
    type_icon:       f.issuetype?.iconUrl || null,
    priority_id:     f.priority?.id || null,
    priority_name:   f.priority?.name || null,
    priority_icon:   f.priority?.iconUrl || null,
    assignee_id:     f.assignee?.accountId || null,
    assignee_name:   f.assignee?.displayName || null,
    assignee_avatar: f.assignee?.avatarUrls?.['48x48'] || null,
    assignee_email:  f.assignee?.emailAddress || null,
    reporter_id:     f.reporter?.accountId || null,
    reporter_name:   f.reporter?.displayName || null,
    reporter_avatar: f.reporter?.avatarUrls?.['48x48'] || null,
    creator_id:      f.creator?.accountId || null,
    creator_name:    f.creator?.displayName || null,
    creator_avatar:  f.creator?.avatarUrls?.['48x48'] || null,
    labels:          f.labels || [],
    components:      (f.components || []).map(c => ({ id: c.id, name: c.name })),
    fix_versions:    (f.fixVersions || []).map(v => ({ id: v.id, name: v.name })),
    parent_key:      f.parent?.key || null,
    parent_title:    f.parent?.fields?.summary || null,
    jira_created_at: f.created || null,
    jira_updated_at: f.updated || null,
    jira_resolved_at:f.resolutiondate || null,
    synced_at:       new Date().toISOString()
  };
}

// ─────────────────────────────────────────────
// Jira API — busca com paginação
// ─────────────────────────────────────────────

export async function fetchAllIssuesFromJira(baseUrl, email, token, jql) {
  const authHeader = makeAuthHeader(email, token);
  const allIssues = [];
  let nextPageToken = null;
  let page = 1;
  const MAX_PAGES = 200;

  console.log('[Jira] Iniciando busca. JQL:', jql.substring(0, 80) + '...');

  while (page <= MAX_PAGES) {
    const payload = {
      jql,
      maxResults: 100,
      fields: JIRA_FIELDS,
      ...(nextPageToken ? { nextPageToken } : {})
    };

    const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });

    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch {
      throw new Error(`Resposta inválida do Jira (pág ${page}): ${text.substring(0, 200)}`);
    }

    if (response.status === 401) throw new Error('Credenciais inválidas (401). Verifique email e token.');
    if (response.status === 403) throw new Error('Acesso negado (403). Verifique permissões do token.');
    if (response.status === 400) throw new Error(`JQL inválida (400): ${JSON.stringify(json).substring(0, 200)}`);
    if (!response.ok) throw new Error(`Erro Jira ${response.status}: ${JSON.stringify(json).substring(0, 200)}`);

    const issues = Array.isArray(json.issues) ? json.issues : [];
    allIssues.push(...issues);

    console.log(`[Jira] Pág ${page}: +${issues.length} issues (total: ${allIssues.length}) | isLast: ${json.isLast}`);

    if (json.isLast === true || !json.nextPageToken) break;
    nextPageToken = json.nextPageToken;
    page++;
  }

  console.log(`[Jira] Busca concluída. Total: ${allIssues.length} issues em ${page} páginas.`);
  return allIssues;
}

// ─────────────────────────────────────────────
// Supabase — upsert em lotes
// ─────────────────────────────────────────────

export async function upsertIssuesToDatabase(rawIssues) {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }

  const normalized = rawIssues.map(normalizeIssue);
  const BATCH = 200;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < normalized.length; i += BATCH) {
    const batch = normalized.slice(i, i + BATCH);

    const { data, error } = await supabase
      .from('jira_issues')
      .upsert(batch, {
        onConflict: 'issue_id',   // chave única — nunca duplica
        ignoreDuplicates: false   // sempre atualiza campos
      })
      .select('issue_id, created_at, synced_at');

    if (error) {
      throw new Error(`Erro ao salvar issues no banco (lote ${i / BATCH + 1}): ${error.message}`);
    }

    // Conta inseridos vs atualizados pela diferença de timestamps
    const now = new Date();
    data.forEach(row => {
      const createdMs = new Date(row.created_at).getTime();
      const syncedMs  = new Date(row.synced_at).getTime();
      const diffMs    = Math.abs(syncedMs - createdMs);
      if (diffMs < 5000) inserted++; else updated++;
    });

    console.log(`[DB] Lote ${i / BATCH + 1}: ${batch.length} issues processadas (acum: ${i + batch.length}/${normalized.length})`);
  }

  console.log(`[DB] Upsert concluído. Novos: ~${inserted} | Atualizados: ~${updated}`);
  return { total: normalized.length, inserted, updated };
}

// ─────────────────────────────────────────────
// Supabase — leitura para dashboard/listagem
// ─────────────────────────────────────────────

export async function fetchIssuesFromDatabase(filters = {}) {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase não configurado.');
  }

  let query = supabase.from('jira_issues').select('*');

  if (filters.project)  query = query.eq('project_key', filters.project);
  if (filters.status)   query = query.eq('status_name', filters.status);
  if (filters.assignee) query = query.eq('assignee_id', filters.assignee);
  if (filters.priority) query = query.eq('priority_name', filters.priority);
  if (filters.type)     query = query.eq('type_name', filters.type);

  query = query.order('jira_updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar issues do banco: ${error.message}`);

  return data || [];
}

export async function countIssuesInDatabase() {
  if (!isConfigured || !supabase) return 0;
  const { count, error } = await supabase
    .from('jira_issues')
    .select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count || 0;
}

// ─────────────────────────────────────────────
// Testa conexão com o Jira
// ─────────────────────────────────────────────

export async function testJiraConnection(baseUrl, email, token, jql) {
  try {
    baseUrl = baseUrl?.trim()?.replace(/\/$/, '') || '';
    email   = email?.trim() || '';
    token   = token?.trim() || '';

    if (!baseUrl || !email || !token) {
      return { success: false, error: 'Credenciais incompletas (URL, email ou token ausente).' };
    }
    if (!baseUrl.startsWith('https://')) {
      return { success: false, error: 'URL deve começar com https://' };
    }
    if (!baseUrl.includes('.atlassian.net')) {
      return { success: false, error: 'URL deve ser um domínio .atlassian.net' };
    }

    const authHeader = makeAuthHeader(email, token);

    // 1) Testa autenticação
    const myselfRes = await fetch(`${baseUrl}/rest/api/3/myself`, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });

    if (myselfRes.status === 401) return { success: false, error: 'Email ou token inválidos (401).' };
    if (myselfRes.status === 403) return { success: false, error: 'Token sem permissão de leitura (403).' };
    if (!myselfRes.ok) return { success: false, error: `Erro ao autenticar: ${myselfRes.status}` };

    const user = await myselfRes.json();

    // 2) Testa JQL — busca amostra + contagem total
    const effectiveJql = jql?.trim() || 'project is not EMPTY ORDER BY updated DESC';

    // 2a) Busca amostra via API v3 (POST /search/jql)
    const searchRes = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: effectiveJql, maxResults: 1, fields: ['key', 'summary', 'status', 'project'] }),
      signal: AbortSignal.timeout(15000)
    });

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}));
      return { success: false, error: `JQL inválida ou sem acesso (${searchRes.status}): ${JSON.stringify(err).substring(0, 150)}` };
    }

    const searchData = await searchRes.json();
    const sampleIssues = (searchData.issues || []).map(i => ({
      key: i.key,
      title: i.fields?.summary,
      project: i.fields?.project?.key,
      status: i.fields?.status?.name
    }));

    // 2b) Busca contagem total via API antiga (GET /search?maxResults=0)
    //     A API v3 POST /search/jql NÃO retorna o campo 'total',
    //     então usamos a API clássica apenas para contagem.
    let totalTickets = searchData.issues?.length || 0;
    try {
      const countUrl = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(effectiveJql)}&maxResults=0`;
      const countRes = await fetch(countUrl, {
        method: 'GET',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      if (countRes.ok) {
        const countData = await countRes.json();
        totalTickets = countData.total || totalTickets;
      }
    } catch (countError) {
      console.warn('[Jira] Falha ao buscar contagem total (fallback para tamanho do array):', countError.message);
    }

    return {
      success: true,
      user: { displayName: user.displayName, email: user.emailAddress, accountId: user.accountId },
      testResult: {
        totalTickets,
        isLast: searchData.isLast,
        sampleIssues
      }
    };
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { success: false, error: 'Timeout ao conectar com o Jira. Verifique a URL.' };
    }
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// Agrega dados do banco para o dashboard
// ─────────────────────────────────────────────

/**
 * Enriquece issue flat (do banco) com propriedades aninhadas
 * para compatibilidade com o frontend.
 */
function enrichIssue(issue) {
  return {
    ...issue,
    // Aliases aninhados para compatibilidade com o frontend
    id: issue.issue_id,
    key: issue.issue_key,
    title: issue.title,
    project: {
      id: issue.project_id,
      key: issue.project_key,
      name: issue.project_name,
      avatar: issue.project_avatar
    },
    status: {
      id: issue.status_id,
      name: issue.status_name,
      category: issue.status_category
    },
    type: {
      id: issue.type_id,
      name: issue.type_name,
      icon: issue.type_icon
    },
    priority: issue.priority_name ? {
      id: issue.priority_id,
      name: issue.priority_name,
      icon: issue.priority_icon
    } : null,
    assignee: issue.assignee_id ? {
      id: issue.assignee_id,
      name: issue.assignee_name,
      avatar: issue.assignee_avatar,
      email: issue.assignee_email
    } : null,
    reporter: issue.reporter_id ? {
      id: issue.reporter_id,
      name: issue.reporter_name,
      avatar: issue.reporter_avatar
    } : null,
    creator: issue.creator_id ? {
      id: issue.creator_id,
      name: issue.creator_name,
      avatar: issue.creator_avatar
    } : null,
    parent: issue.parent_key ? {
      key: issue.parent_key,
      title: issue.parent_title
    } : null,
    createdAt: issue.jira_created_at,
    updatedAt: issue.jira_updated_at,
    resolvedAt: issue.jira_resolved_at
  };
}

export function buildDashboardData(rawIssues) {
  // Enriquecer issues com formato aninhado
  const issues = rawIssues.map(enrichIssue);

  const projectsMap  = {};
  const analystsMap  = {};
  const statusesSet  = new Set();
  const prioritiesMap = {};

  const DEFAULT_STATUS_ORDER = [
    'NÃO INICIADO', 'EM PROGRESSO', 'READY4TEST',
    'VALIDAÇÃO CLIENTE', 'BLOQUEADO', 'CONCLUÍDO', 'CANCELADO'
  ];

  function statusOrder(name) {
    const up = (name || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const idx = DEFAULT_STATUS_ORDER.findIndex(s =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === up
    );
    return idx >= 0 ? idx : 99;
  }

  issues.forEach(issue => {
    const projectKey = issue.project_key || '';
    const statusName = issue.status_name || 'Unknown';
    const assigneeId = issue.assignee_id;

    // Projetos
    if (projectKey) {
      if (!projectsMap[projectKey]) {
        projectsMap[projectKey] = {
          id: issue.project_id, key: projectKey,
          name: issue.project_name, avatar: issue.project_avatar,
          totalTickets: 0, statuses: {}, analysts: new Set()
        };
      }
      projectsMap[projectKey].totalTickets++;
      if (assigneeId) projectsMap[projectKey].analysts.add(assigneeId);
      projectsMap[projectKey].statuses[statusName] = (projectsMap[projectKey].statuses[statusName] || 0) + 1;
    }

    // Status global
    statusesSet.add(statusName);

    // Analistas
    if (assigneeId) {
      if (!analystsMap[assigneeId]) {
        analystsMap[assigneeId] = {
          id: assigneeId, name: issue.assignee_name,
          avatar: issue.assignee_avatar, email: issue.assignee_email,
          totalTickets: 0, ticketsByStatus: {}, ticketsByProject: {}
        };
      }
      analystsMap[assigneeId].totalTickets++;
      analystsMap[assigneeId].ticketsByStatus[statusName] = (analystsMap[assigneeId].ticketsByStatus[statusName] || 0) + 1;
      analystsMap[assigneeId].ticketsByProject[projectKey] = (analystsMap[assigneeId].ticketsByProject[projectKey] || 0) + 1;
    }

    // Prioridades
    if (issue.priority_name) {
      prioritiesMap[issue.priority_name] = (prioritiesMap[issue.priority_name] || 0) + 1;
    }
  });

  const projects = Object.values(projectsMap).map(p => ({ ...p, analystCount: p.analysts.size, analysts: undefined }));
  const analysts = Object.values(analystsMap);
  const statuses = Array.from(statusesSet).sort((a, b) => statusOrder(a) - statusOrder(b));
  const total    = issues.length;

  const byStatus = {};
  statuses.forEach(s => { byStatus[s] = issues.filter(i => i.status_name === s).length; });

  const percentByStatus = {};
  Object.entries(byStatus).forEach(([s, c]) => { percentByStatus[s] = total > 0 ? Math.round((c / total) * 100) : 0; });

  const byProject = {};
  projects.forEach(p => { byProject[p.key] = p.totalTickets; });

  const byAnalyst = {};
  analysts.forEach(a => { byAnalyst[a.name] = a.totalTickets; });

  const board = {
    columns: statuses.map(s => ({
      name: s,
      total: byStatus[s] || 0,
      issues: issues.filter(i => i.status_name === s)
    }))
  };

  return {
    lastSyncedAt: issues.length > 0 ? issues[0].synced_at : null,
    totalIssues: total,
    totalProjects: projects.length,
    totalAnalysts: analysts.length,
    issues,
    projects,
    analysts,
    statuses,
    metrics: {
      byProject, byStatus, byAnalyst,
      byPriority: prioritiesMap,
      percentByStatus,
      distributionByProject: byProject,
      distributionByAnalyst: byAnalyst,
      unassigned: issues.filter(i => !i.assignee_id).length,
      blocked: issues.filter(i => (i.status_name || '').toLowerCase().includes('bloq') || (i.status_name || '').toLowerCase().includes('block')).length,
      done: issues.filter(i => (i.status_category || '').toLowerCase() === 'done' || (i.status_name || '').toLowerCase().includes('conclu') || (i.status_name || '').toLowerCase().includes('done')).length,
      inProgress: issues.filter(i => (i.status_category || '').toLowerCase() === 'indeterminate' || (i.status_name || '').toLowerCase().includes('progr') || (i.status_name || '').toLowerCase().includes('andamento')).length
    },
    board
  };
}