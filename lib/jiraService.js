/**
 * jiraService.js — Serviço de integração com Jira Cloud API
 * 
 * Responsabilidades:
 * - Autenticar na API do Jira
 * - Executar JQL com paginação
 * - Normalizar dados para o formato do dashboard
 * - Implementar cache em memória
 * - Tratar erros de forma robusta
 */
import NodeCache from 'node-cache';
import { configService } from './configService.js';

const JIRA_FIELDS = [
  'summary',
  'status',
  'assignee',
  'reporter',
  'creator',
  'project',
  'issuetype',
  'priority',
  'created',
  'updated',
  'resolutiondate',
  'labels',
  'components',
  'fixVersions',
  'parent'
];

const DEFAULT_STATUS_ORDER = [
  'NÃO INICIADO',
  'EM PROGRESSO',
  'READY4TEST',
  'VALIDAÇÃO CLIENTE',
  'BLOQUEADO',
  'CONCLUÍDO',
  'CANCELADO'
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
   * Valida a configuração atual
   */
  validateConfig() {
    const baseUrl = configService.getConfig().baseUrl;
    const email = configService.getConfig().email;
    const token = configService.getToken();

    const errors = [];
    
    if (!baseUrl) {
      errors.push('JIRA_BASE_URL não configurado');
    } else if (!baseUrl.startsWith('https://')) {
      errors.push('JIRA_BASE_URL deve começar com https://');
    }
    
    if (!email) {
      errors.push('JIRA_EMAIL não configurado');
    }
    
    if (!token) {
      errors.push('JIRA_API_TOKEN não configurado');
    }
    
    if (errors.length > 0) {
      throw new Error(`Credenciais do Jira inválidas: ${errors.join(', ')}`);
    }
    
    const credentials = Buffer.from(`${email}:${token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Valida se a JQL contém apenas projetos autorizados
   */
  validateJQL(jql) {
    const allowedProjects = ['BLCASH', 'BB', 'CEP', 'CTR', 'CVM175', 'DTVSLI', 'ETF', 'PGINT', 'SDDS2', 'SDDSF2', 'BNPTD', 'BTA', 'MAR', 'P1'];
    const projectMatch = jql.match(/project\s+in\s*\(([^)]+)\)/i);
    
    if (projectMatch) {
      const projects = projectMatch[1].split(',').map(p => p.trim().toUpperCase());
      const invalidProjects = projects.filter(p => !allowedProjects.includes(p));
      
      if (invalidProjects.length > 0) {
        throw new Error(`JQL contém projetos não autorizados: ${invalidProjects.join(', ')}`);
      }
    }
  }

  /**
   * Executa uma requisição para a API do Jira
   */
  async fetchFromJira(endpoint, options = {}) {
    const baseUrl = configService.getConfig().baseUrl;
    const url = `${baseUrl}${endpoint}`;
    
    const authHeader = this.validateConfig();
    
    const headers = {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        throw new Error('Credenciais do Jira inválidas (401 Unauthorized)');
      }
      
      if (response.status === 403) {
        throw new Error('Acesso negado ao Jira (403 Forbidden). Verifique as permissões do token.');
      }
      
      if (response.status === 429) {
        throw new Error('Rate limit excedido. Aguarde alguns minutos antes de tentar novamente.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro do Jira (${response.status}): ${errorText.substring(0, 200)}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        throw new Error('Timeout ao conectar com o Jira. Verifique a URL e a conexão.');
      }
      
      throw error;
    }
  }

  /**
   * Testa conexão com credenciais específicas (sem alterar config global)
   */
  async testConnectionWithConfig(baseUrl, email, token, jql = null) {
    try {
      // Sanitizar inputs
      baseUrl = baseUrl?.trim();
      email = email?.trim();
      token = token?.trim();
      jql = jql?.trim();
      
      // Validar inputs -必須 ter todos
      if (!baseUrl || !email || !token) {
        return { success: false, error: 'Credenciais incompletas' };
      }
      
      if (!baseUrl.startsWith('https://')) {
        return { success: false, error: 'URL deve começar com https://' };
      }
      
      // Remover trailing slash
      baseUrl = baseUrl.replace(/\/$/, '');
      
      const credentials = Buffer.from(`${email}:${token}`).toString('base64');
      const authHeader = `Basic ${credentials}`;
      
      // Tenta buscar informações do usuário atual
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (response.status === 401) {
        return { success: false, error: 'Credenciais inválidas' };
      }
      
if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Erro: ${response.status} - ${error.substring(0, 100)}` };
      }

      const user = await response.json();
      
      // Testa a JQL com busca básica de todos os projetos
      const jqlToTest = (jql && jql.trim()) || 'project is not EMPTY ORDER BY created DESC';
      
      const jqlResponse = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jql: jqlToTest,
          maxResults: 1,
          fields: ['key']
        })
      });
      
      let testResult = { total: 0 };
      if (jqlResponse.ok) {
        const json = await jqlResponse.json();
        testResult = { total: json.total || 0 };
      }

      return { 
        success: true, 
        user: {
          displayName: user.displayName,
          email: user.emailAddress,
          accountId: user.accountId
        },
        testResult: testResult
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão com credenciais específicas
   */
  async testConnection() {
    try {
      const authHeader = this.validateConfig();
      const baseUrl = configService.getConfig().baseUrl;
      
      // Tenta buscar informações do usuário atual
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (response.status === 401) {
        return { success: false, error: 'Credenciais inválidas' };
      }
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Erro: ${response.status} - ${error.substring(0, 100)}` };
      }

      const user = await response.json();
      
      // Testa a JQL com um busca pequena usando o novo endpoint
      const jql = configService.getJQL();
      this.validateJQL(jql);
      
      const testResult = await this.fetchFromJira('/rest/api/3/search/jql', {
        method: 'POST',
        body: JSON.stringify({
          jql: jql,
          maxResults: 1,
          fields: ['key']
        })
      });

      return { 
        success: true, 
        user: {
          displayName: user.displayName,
          email: user.emailAddress,
          accountId: user.accountId
        },
        testResult: {
          total: testResult.total,
          jqlValid: true
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca todos os issues com credenciais específicas (sem alterar config global, sem cache)
   */
  async fetchAllIssuesWithConfig(baseUrl, email, token, jql = null) {
    // Validar credenciais fornecidas
    if (!baseUrl || !email || !token) {
      throw new Error('Credenciais incompletas: baseUrl, email e token são obrigatórios');
    }
    
    // Sanitizar
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    email = email.trim();
    token = token.trim();
    const effectiveJql = (jql && jql.trim()) || DEFAULT_JQL;
    
    console.log('[JiraService] Buscando issues com credenciais fornecidas, JQL:', effectiveJql.substring(0, 80) + '...');
    
    const credentials = Buffer.from(`${email}:${token}`).toString('base64');
    const authHeader = `Basic ${credentials}`;
    
    const allIssues = [];
    let nextPageToken = null;
    let isLast = false;
    let total = 0;
    let pageCount = 0;
    
    while (!isLast) {
      const payload = {
        jql: effectiveJql,
        maxResults: 100,
        fields: JIRA_FIELDS
      };
      
      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }
      
      const result = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!result.ok) {
        const errorText = await result.text();
        throw new Error(`Erro do Jira (${result.status}): ${errorText.substring(0, 200)}`);
      }
      
      const json = await result.json();
      const issues = json.issues || [];
      allIssues.push(...issues);
      
      if (total === 0) {
        total = json.total;
        console.log(`[JiraService] Total de issues: ${total}`);
      }
      
      pageCount++;
      console.log(`[JiraService] Página ${pageCount}: ${issues.length} issues (total: ${allIssues.length}/${total})`);
      
      nextPageToken = json.nextPageToken || null;
      isLast = json.isLast === true || !nextPageToken;
    }
    
    console.log(`[JiraService] Finalizado! Total de ${allIssues.length} issues em ${pageCount} páginas`);
    
    const normalized = this.normalizeIssues(allIssues);
    const dashboardData = this.buildDashboardData(normalized);
    
    return dashboardData;
  }

  /**
   * Busca todos os issues com paginação usando nextPageToken
   */
  async fetchAllIssues() {
    const cacheKey = 'jira_issues';
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      console.log('[JiraService] Retornando dados do cache');
      return cached;
    }

    const jql = configService.getJQL();
    this.validateJQL(jql);

    console.log('[JiraService] Buscando issues do Jira com JQL:', jql.substring(0, 80) + '...');

    const allIssues = [];
    let nextPageToken = null;
    let isLast = false;
    let total = 0;
    let pageCount = 0;

    while (!isLast) {
      const payload = {
        jql,
        maxResults: 100,
        fields: JIRA_FIELDS
      };

      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }

      const result = await this.fetchFromJira('/rest/api/3/search/jql', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const issues = result.issues || [];
      allIssues.push(...issues);
      
      if (total === 0) {
        total = result.total;
        console.log(`[JiraService] Total de issues: ${total}`);
      }

      pageCount++;
      console.log(`[JiraService] Página ${pageCount}: ${issues.length} issues (total: ${allIssues.length}/${total})`);

      nextPageToken = result.nextPageToken || null;
      isLast = result.isLast === true || !nextPageToken;
    }

    console.log(`[JiraService] Finalizado! Total de ${allIssues.length} issues em ${pageCount} páginas`);

    const normalized = this.normalizeIssues(allIssues);
    const dashboardData = this.buildDashboardData(normalized);

    this.cache.set(cacheKey, dashboardData);
    console.log(`[JiraService] Cache atualizado. TTL: ${this.cache.getTtl(cacheKey) / 1000}s`);

    return dashboardData;
  }

  /**
   * Normaliza um issue do Jira para o formato interno
   */
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
      components: (fields.components || []).map(c => ({
        id: c.id,
        name: c.name
      })),
      fixVersions: (fields.fixVersions || []).map(v => ({
        id: v.id,
        name: v.name
      })),
      parent: fields.parent ? {
        key: fields.parent.key,
        title: fields.parent.fields?.summary || null
      } : null
    };
  }

  /**
   * Normaliza todos os issues
   */
  normalizeIssues(issues) {
    return issues.map(issue => this.normalizeIssue(issue));
  }

  /**
   * Constrói os dados agregados para o dashboard
   */
  buildDashboardData(issues) {
    const projectsMap = {};
    const analystsMap = {};
    const statusesSet = new Set();
    const prioritiesMap = {};

    issues.forEach(issue => {
      const { project, status, assignee, priority } = issue;

      // Projetos
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

      // Status (global)
      statusesSet.add(status.name);

      // Analistas
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

      // Prioridades
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

    // Métricas
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

    // Board columns com ordenação preferencial
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

    // Percentuais por status
    const totalIssues = issues.length;
    const percentByStatus = {};
    Object.entries(metrics.byStatus).forEach(([status, count]) => {
      percentByStatus[status] = totalIssues > 0 ? Math.round((count / totalIssues) * 100) : 0;
    });

    // Distribuição por projeto
    const distributionByProject = {};
    projects.forEach(p => {
      distributionByProject[p.key] = p.totalTickets;
    });

    // Distribuição por analista
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

  /**
   * Limpa o cache manualmente
   */
  clearCache() {
    this.cache.flushAll();
    configService.clearCache();
    console.log('[JiraService] Cache limpo');
    return { message: 'Cache limpo com sucesso' };
  }

  /**
   * Retorna status do cache
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Recarrega o cache com novo TTL
   */
  reloadCache() {
    this._initCache();
  }
}

export const jiraService = new JiraService();