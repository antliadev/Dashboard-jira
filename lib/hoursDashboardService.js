import { checkSupabaseConfig, supabase } from './supabaseServer.js';
import { fetchCrawfordWorklogsFromJira } from './jiraWorklogService.js';

export const CRAWFORD_MONTHLY_CAPACITY_SECONDS = 100 * 60 * 60;
const PROJECT_KEY = 'CRAWFORD';
const TIME_ZONE = 'America/Sao_Paulo';

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function secondsToHours(seconds) {
  return round((Number(seconds) || 0) / 3600);
}

export function competenceFromStarted(startedAt) {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function capacityStatus(usedSeconds, capacitySeconds = CRAWFORD_MONTHLY_CAPACITY_SECONDS) {
  const used = Math.max(0, Number(usedSeconds) || 0);
  const capacity = Math.max(0, Number(capacitySeconds) || 0);
  const percentage = capacity > 0 ? round((used / capacity) * 100) : 0;
  let level = 'normal';
  if (percentage > 100) level = 'exceeded';
  else if (percentage === 100) level = 'exhausted';
  else if (percentage >= 90) level = 'critical';
  else if (percentage >= 80) level = 'attention';
  return {
    percentage,
    level,
    availableSeconds: Math.max(0, capacity - used),
    overageSeconds: Math.max(0, used - capacity)
  };
}

function labelForMonth(competence) {
  const [year, month] = competence.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function buildCrawfordHoursDashboard(worklogs, issues, selectedCompetence = null) {
  const issuesByKey = new Map((issues || []).map(issue => [issue.issue_key, issue]));
  const monthlyMap = new Map();
  const details = [];

  for (const worklog of worklogs || []) {
    const competence = competenceFromStarted(worklog.started_at);
    if (!competence) continue;
    const seconds = Math.max(0, Number(worklog.time_spent_seconds) || 0);
    monthlyMap.set(competence, (monthlyMap.get(competence) || 0) + seconds);
    const issue = issuesByKey.get(worklog.issue_key) || {};
    const parent = issue.parent_key ? issuesByKey.get(issue.parent_key) : null;
    const firstComponent = Array.isArray(issue.components) ? issue.components[0]?.name : null;
    const application = parent?.title || issue.parent_title || firstComponent || issue.title || 'Crawford';
    details.push({
      date: worklog.started_at,
      competence,
      ticket: worklog.issue_key,
      application,
      issueDescription: issue.title || '',
      activityDescription: worklog.description || issue.title || '',
      author: worklog.author_name || 'Nao informado',
      timeSpentSeconds: seconds,
      time: formatDuration(seconds),
      hours: secondsToHours(seconds),
      jiraUrl: issue.jira_url || null
    });
  }

  const availableCompetences = [...monthlyMap.keys()].sort();
  const currentCompetence = competenceFromStarted(new Date().toISOString());
  const competence = selectedCompetence || (monthlyMap.has(currentCompetence) ? currentCompetence : availableCompetences.at(-1)) || currentCompetence;
  const selectedSeconds = monthlyMap.get(competence) || 0;
  const state = capacityStatus(selectedSeconds);
  const selectedDetails = details
    .filter(row => row.competence === competence)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const applicationMap = new Map();
  for (const row of selectedDetails) {
    applicationMap.set(row.application, (applicationMap.get(row.application) || 0) + row.timeSpentSeconds);
  }

  const hoursByApplication = [...applicationMap.entries()]
    .map(([application, seconds]) => ({ application, name: application, seconds, hours: secondsToHours(seconds) }))
    .sort((a, b) => b.seconds - a.seconds);
  const monthlyConsumption = availableCompetences.map(month => {
    const seconds = monthlyMap.get(month) || 0;
    const monthState = capacityStatus(seconds);
    return {
      competence: month,
      label: labelForMonth(month),
      seconds,
      hours: secondsToHours(seconds),
      usedHours: secondsToHours(seconds),
      consumptionPercentage: monthState.percentage,
      status: monthState.level
    };
  });
  const entries = selectedDetails.map(row => ({
    ...row,
    description: row.activityDescription,
    timeSeconds: row.timeSpentSeconds,
    timeHours: row.hours,
    monthYear: row.competence
  }));

  return {
    project: { key: PROJECT_KEY, name: 'Crawford' },
    projectKey: PROJECT_KEY,
    timeZone: TIME_ZONE,
    competence,
    availableCompetences,
    allowanceHours: 100,
    usedHours: secondsToHours(selectedSeconds),
    availableHours: secondsToHours(state.availableSeconds),
    overageHours: secondsToHours(state.overageSeconds),
    utilizationPercent: state.percentage,
    alertLevel: state.level,
    capacity: {
      contractedSeconds: CRAWFORD_MONTHLY_CAPACITY_SECONDS,
      contractedHours: 100,
      usedSeconds: selectedSeconds,
      usedHours: secondsToHours(selectedSeconds),
      availableSeconds: state.availableSeconds,
      availableHours: secondsToHours(state.availableSeconds),
      overageSeconds: state.overageSeconds,
      overageHours: secondsToHours(state.overageSeconds),
      consumptionPercentage: state.percentage,
      status: state.level
    },
    hoursByApplication,
    byApplication: hoursByApplication,
    monthlyConsumption,
    monthlyHistory: monthlyConsumption,
    details: selectedDetails,
    entries,
    generatedAt: new Date().toISOString()
  };
}

export function validateCompetence(value) {
  if (value == null || value === '') return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))) {
    throw new Error('Competencia invalida. Use o formato YYYY-MM.');
  }
  return String(value);
}

function isMissingWorklogTable(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST205'
    || /jira_worklogs.*schema cache/i.test(message)
    || /relation .*jira_worklogs.* does not exist/i.test(message);
}

function jiraCredentialsFromEnv() {
  const baseUrl = process.env.JIRA_BASE_URL?.trim().replace(/\/$/, '');
  const email = process.env.JIRA_EMAIL?.trim();
  const token = process.env.JIRA_API_TOKEN?.trim();
  return baseUrl && email && token ? { baseUrl, email, token } : null;
}

async function fetchAllRows(table, columns, configureQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select(columns);
    query = configureQuery(query)
      .range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return { data: rows, error: null };
  }
}

export async function fetchCrawfordHoursDashboard({ competence = null } = {}) {
  if (!supabase) {
    const config = checkSupabaseConfig();
    throw new Error(config.error || 'Supabase nao configurado para leitura de horas.');
  }

  const validCompetence = validateCompetence(competence);
  const [{ data: worklogs, error: worklogError }, { data: issues, error: issueError }] = await Promise.all([
    fetchAllRows(
      'jira_worklogs',
      'worklog_id,issue_id,issue_key,author_account_id,author_name,description,started_at,time_spent_seconds,jira_created_at,jira_updated_at,synced_at',
      query => query.eq('project_key', PROJECT_KEY).order('started_at', { ascending: true })
    ),
    fetchAllRows(
      'jira_issues',
      'issue_id,issue_key,title,parent_key,parent_title,components,jira_url',
      query => query.eq('project_key', PROJECT_KEY).order('issue_key', { ascending: true })
    )
  ]);

  if (issueError) throw new Error(`Erro ao ler tickets Crawford: ${issueError.message}`);
  if (worklogError) {
    if (!isMissingWorklogTable(worklogError)) {
      throw new Error(`Erro ao ler worklogs Crawford: ${worklogError.message}`);
    }
    const credentials = jiraCredentialsFromEnv();
    if (!credentials) {
      throw new Error(`Erro ao ler worklogs Crawford: ${worklogError.message}. Execute sql/migration-hours-dashboard.sql.`);
    }
    const liveWorklogs = await fetchCrawfordWorklogsFromJira(issues || [], credentials);
    return {
      ...buildCrawfordHoursDashboard(liveWorklogs, issues || [], validCompetence),
      dataSource: 'jira-live-fallback',
      persistenceWarning: 'A tabela jira_worklogs ainda nao existe; dados consultados diretamente no Jira.'
    };
  }
  return {
    ...buildCrawfordHoursDashboard(worklogs || [], issues || [], validCompetence),
    dataSource: 'supabase'
  };
}
