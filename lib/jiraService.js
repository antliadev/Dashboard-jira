/**
 * jiraService.js — Serviço de integração com Jira Cloud API
 * CORRIGIDO: usar nextPageToken em vez de startAt
 */
import NodeCache from 'node-cache';
import { configService } from './configService.js';

// JQL padrão com projetos específicos
const DEFAULT_JQL = 'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY project ASC, status ASC, assignee ASC, updated DESC';

const JIRA_FIELDS = [
  'summary', 'status', 'assignee', 'reporter', 'creator', 
  'project', 'issuetype', 'priority', 'created', 'updated', 
  'resolutiondate', 'labels', 'components', 'fixVersions', 'parent'
];

const DEFAULT_STATUS_ORDER = [
  'NÃO INICIADO', 'EM PROGRESSO', 'READY4TEST', 'VALIDAÇÃO CLIENTE', 
  'BLOQUEADO', 'CONCLUÍDO', 'CANCELADO'
];

class JiraService {
  constructor() {
    this.cache = null;
    this._initCache();
  }

  _initCache() {
    const ttlSeconds = Math.floor(configService.getCacheTtl() / 1000);
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: 60 });
  }

  /**
   * Testa conexão com credenciais específicas
   * CORRIGIDO: sem startAt, usando nextPageToken
   */
  async testConnectionWithConfig(baseUrl, email, token, jql = null) {
    try {
      // Sanitizar
      baseUrl = baseUrl?.trim()?.replace(/\/$/, '') || '';
      email = email?.trim() || '';
      token = token?.trim() || '';
      const effectiveJql = jql?.trim() || DEFAULT_JQL;
      
      if (!baseUrl || !email || !token) {
        return { success: false, error: 'Credenciais incompletas' };
      }
      
      if (!baseUrl.startsWith('https://')) {
        return { success: false, error: 'URL deve começar com https://' };
      }
      
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      
      // A) Testar autenticação com /rest/api/3/myself
      const myselfResponse = await fetch(`${baseUrl}/rest/api/3/myself`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });
      
      const myselfText = await myselfResponse.text();
      let myselfJson;
      try {
        myselfJson = JSON.parse(myselfText);
      } catch {
        throw new Error(`Erro de autenticação: não foi possível parsear resposta`);
      }
      
      if (!myselfResponse.ok) {
        throw new Error(`Credenciais inválidas (${myselfResponse.status})`);
      }
      
      // B) Testar JQL usando /rest/api/3/search/jql sem startAt
      const searchResponse = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jql: effectiveJql,
          maxResults: 100,
          fields: ['key', 'summary', 'status', 'project', 'assignee', 'priority', 'created', 'updated'],
          nextPageToken: null
        })
      });
      
      const searchText = await searchResponse.text();
      let searchJson;
      try {
        searchJson = JSON.parse(searchText);
      } catch {
        throw new Error(`Resposta inválida do Jira search: ${searchText.substring(0, 100)}`);
      }
      
      if (!searchResponse.ok) {
        return { 
          success: false, 
          error: `Erro na busca: ${JSON.stringify(searchJson).substring(0, 200)}` 
        };
      }
      
      const issues = Array.isArray(searchJson.issues) ? searchJson.issues : [];
      
      // Calcular total estimado baseado em issues retornadas
      const estimatedTotal = issues.length > 0 ? (searchJson.isLast ? issues.length : issues.length * 10) : 0;
      
      return { 
        success: true, 
        user: {
          displayName: myselfJson.displayName,
          email: myselfJson.emailAddress,
          accountId: myselfJson.accountId
        },
        testResult: {
          totalTickets: estimatedTotal,
          returned: issues.length,
          isLast: searchJson.isLast,
          nextPageToken: searchJson.nextPageToken || null,
          sampleIssues: issues.slice(0, 5).map(issue => ({
            key: issue.key,
            title: issue.fields?.summary,
            project: issue.fields?.project?.key,
            status: issue.fields?.status?.name
          }))
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca todos os issues com credenciais específicas
   * CORRIGIDO: usar nextPageToken em vez de startAt
   */
  async fetchAllIssuesWithConfig(baseUrl, email, token, jql = null) {
    // Validar credenciais
    if (!baseUrl || !email || !token) {
      throw new Error('Credenciais incompletas');
    }
    
    // Sanitizar
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    email = email.trim();
    token = token.trim();
    const effectiveJql = (jql && jql.trim()) || DEFAULT_JQL;
    
    const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
    
    console.log('[JiraService] ====================================');
    console.log('[JiraService] Buscando issues do Jira...');
    console.log('[JiraService] JQL:', effectiveJql);
    console.log('[JiraService] ====================================');
    
    const allIssues = [];
    let nextPageToken = null;
    let page = 1;
    
    // Loop de paginação usando nextPageToken
    while (true) {
      const payload = {
        jql: effectiveJql,
        maxResults: 100,
        fields: JIRA_FIELDS,
        nextPageToken
      };
      
      console.log(`[JiraService] Página ${page}`);
      console.log('[JiraService] nextPageToken:', nextPageToken);
      
      const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const text = await response.text();
      
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida do Jira: ${text.substring(0, 200)}`);
      }
      
      if (!response.ok) {
        throw new Error(`Erro Jira ${response.status}: ${JSON.stringify(json).substring(0, 200)}`);
      }
      
      const issues = Array.isArray(json.issues) ? json.issues : [];
      console.log('[JiraService] issues retornadas:', issues.length);
      console.log('[JiraService] isLast:', json.isLast);
      console.log('[JiraService] nextPageToken response:', json.nextPageToken ? 'sim' : 'não');
      
      allIssues.push(...issues);
      
      // Parar se for última página ou sem nextPageToken
      if (json.isLast === true || !json.nextPageToken) {
        break;
      }
      
      nextPageToken = json.nextPageToken;
      page++;
      
      // Segurança: limite de páginas
      if (page > 200) {
        throw new Error('Loop de paginação interrompido por segurança');
      }
    }
    
    console.log('[JiraService] ====================================');
    console.log('[JiraService] Total final de issues:', allIssues.length);
    console.log('[JiraService] ====================================');
    
    if (allIssues.length === 0) {
      throw new Error('Nenhum ticket encontrado');
    }
    
    const normalized = this.normalizeIssues(allIssues);
    const dashboardData = this.buildDashboardData(normalized);
    
    return dashboardData;
  }

  /**
   * Busca todos os issues com paginação (usando configService)
   */
  async fetchAllIssues() {
    const cacheKey = 'jira_issues';
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      console.log('[JiraService] Retornando dados do cache');
      return cached;
    }
    
    const jql = configService.getJQL();
    const data = await this.fetchAllIssuesWithConfig(
      configService.getConfig().baseUrl,
      configService.getConfig().email,
      configService.getToken(),
      jql
    );
    
    this.cache.set(cacheKey, data);
    return data;
  }

  normalizeIssue(issue) {
    const fields = issue.fields || {};
    
    return {
      id: issue.id,
      key: issue.key,
      title: fields.summary || '',
      status: {
        id: fields.status?.id || null,
        name: fields.status?.name || 'Unknown',
        category: fields.status?.statusCategory?.name || 'Unknown'
      },
      project: {
        id: fields.project?.id || null,
        key: fields.project?.key || '',
        name: fields.project?.name || '',
        avatar: fields.project?.avatarUrls?.['48x48'] || null
      },
      type: {
        id: fields.issuetype?.id || null,
        name: fields.issuetype?.name || 'Task',
        icon: fields.issuetype?.iconUrl || null
      },
      priority: fields.priority ? {
        id: fields.priority.id,
        name: fields.priority.name,
        icon: fields.priority.iconUrl
      } : null,
      assignee: fields.assignee ? {
        id: fields.assignee.accountId,
        name: fields.assignee.displayName,
        avatar: fields.assignee.avatarUrls?.['48x48'] || null,
        email: fields.assignee.emailAddress || null
      } : null,
      reporter: fields.reporter ? {
        id: fields.reporter.accountId,
        name: fields.reporter.displayName,
        avatar: fields.reporter.avatarUrls?.['48x48'] || null
      } : null,
      creator: fields.creator ? {
        id: fields.creator.accountId,
        name: fields.creator.displayName,
        avatar: fields.creator.avatarUrls?.['48x48'] || null
      } : null,
      createdAt: fields.created || null,
      updatedAt: fields.updated || null,
      resolvedAt: fields.resolutiondate || null,
      labels: fields.labels || [],
      components: (fields.components || []).map(c => ({ id: c.id, name: c.name })),
      fixVersions: (fields.fixVersions || []).map(v => ({ id: v.id, name: v.name })),
      parent: fields.parent ? {
        key: fields.parent.key,
        title: fields.parent.fields?.summary || null
      } : null
    };
  }

  normalizeIssues(issues) {
    return issues.map(issue => this.normalizeIssue(issue));
  }

  buildDashboardData(issues) {
    const projectsMap = {};
    const analystsMap = {};
    const statusesSet = new Set();
    const prioritiesMap = {};

    issues.forEach(issue => {
      const { project, status, assignee, priority } = issue;

      if (project.key) {
        if (!projectsMap[project.key]) {
          projectsMap[project.key] = {
            id: project.id,
            key: project.key,
            name: project.name,
            avatar: project.avatar,
            totalTickets: 0,
            statuses: {},
            analysts: new Set()
          };
        }
        projectsMap[project.key].totalTickets++;
        if (assignee) {
          projectsMap[project.key].analysts.add(assignee.id);
        }
        if (!projectsMap[project.key].statuses[status.name]) {
          projectsMap[project.key].statuses[status.name] = 0;
        }
        projectsMap[project.key].statuses[status.name]++;
      }

      statusesSet.add(status.name);

      if (assignee) {
        if (!analystsMap[assignee.id]) {
          analystsMap[assignee.id] = {
            id: assignee.id,
            name: assignee.name,
            avatar: assignee.avatar,
            email: assignee.email,
            totalTickets: 0,
            ticketsByStatus: {},
            ticketsByProject: {}
          };
        }
        analystsMap[assignee.id].totalTickets++;
        
        if (!analystsMap[assignee.id].ticketsByStatus[status.name]) {
          analystsMap[assignee.id].ticketsByStatus[status.name] = 0;
        }
        analystsMap[assignee.id].ticketsByStatus[status.name]++;
        
        if (!analystsMap[assignee.id].ticketsByProject[project.key]) {
          analystsMap[assignee.id].ticketsByProject[project.key] = 0;
        }
        analystsMap[assignee.id].ticketsByProject[project.key]++;
      }

      if (priority) {
        if (!prioritiesMap[priority.name]) {
          prioritiesMap[priority.name] = 0;
        }
        prioritiesMap[priority.name]++;
      }
    });

    const projects = Object.values(projectsMap).map(p => ({
      ...p,
      analystCount: p.analysts.size,
      analysts: undefined
    }));

    const analysts = Object.values(analystsMap);
    const statuses = Array.from(statusesSet);

    const metrics = {
      byProject: {},
      byStatus: {},
      byAnalyst: {},
      byPriority: prioritiesMap,
      unassigned: issues.filter(i => !i.assignee).length,
      blocked: issues.filter(i => 
        i.status.category?.toLowerCase() === 'blocked' ||
        i.status.name.toLowerCase().includes('block')
      ).length,
      done: issues.filter(i => 
        i.status.category?.toLowerCase() === 'done' ||
        i.status.name.toLowerCase().includes('done') ||
        i.status.name.toLowerCase().includes('concluído') ||
        i.status.name.toLowerCase().includes('finalizado')
      ).length,
      inProgress: issues.filter(i => 
        i.status.category?.toLowerCase() === 'indeterminate' ||
        i.status.name.toLowerCase().includes('progress') ||
        i.status.name.toLowerCase().includes('andamento')
      ).length
    };

    projects.forEach(p => {
      metrics.byProject[p.key] = p.totalTickets;
    });

    statuses.forEach(s => {
      metrics.byStatus[s] = issues.filter(i => i.status.name === s).length;
    });

    analysts.forEach(a => {
      metrics.byAnalyst[a.name] = a.totalTickets;
    });

    const sortedStatuses = statuses.sort((a, b) => {
      const aIndex = DEFAULT_STATUS_ORDER.findIndex(s => 
        a.toUpperCase().includes(s) || s.includes(a.toUpperCase())
      );
      const bIndex = DEFAULT_STATUS_ORDER.findIndex(s => 
        b.toUpperCase().includes(s) || s.includes(b.toUpperCase())
      );
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

    const board = {
      columns: sortedStatuses.map(statusName => ({
        name: statusName,
        total: issues.filter(i => i.status.name === statusName).length,
        issues: issues.filter(i => i.status.name === statusName)
      }))
    };

    const percentByStatus = {};
    const totalIssues = issues.length;
    Object.entries(metrics.byStatus).forEach(([status, count]) => {
      percentByStatus[status] = totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0;
    });

    const distributionByProject = {};
    projects.forEach(p => {
      distributionByProject[p.key] = p.totalTickets;
    });

    const distributionByAnalyst = {};
    analysts.forEach(a => {
      distributionByAnalyst[a.name] = a.totalTickets;
    });

    return {
      lastSyncedAt: new Date().toISOString(),
      totalIssues: issues.length,
      totalProjects: projects.length,
      totalAnalysts: analysts.length,
      issues,
      projects,
      analysts,
      statuses,
      metrics: {
        ...metrics,
        percentByStatus,
        distributionByProject,
        distributionByAnalyst
      },
      board
    };
  }

  clearCache() {
    this.cache.flushAll();
    configService.clearCache();
    console.log('[JiraService] Cache limpo');
    return { message: 'Cache limpo com sucesso' };
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  reloadCache() {
    this._initCache();
  }
}

export const jiraService = new JiraService();