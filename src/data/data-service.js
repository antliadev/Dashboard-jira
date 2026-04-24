/**
 * data-service.js — Camada de abstração de dados
 * 
 * Ponto único de acesso aos dados do sistema.
 * Suporta múltiplas fontes: mock, importado, API do Jira.
 * Toda lógica de negócio de consulta centralizada aqui.
 */
import {
  DataSourceType, resolveStatusCategory, StatusCategory,
  isCardOverdue, calculateProjectProgress, calculateProjectHealth,
} from './models.js';

class DataService {
  constructor() {
    this._projects = [];
    this._cards = [];
    this._users = [];
    this._source = DataSourceType.MOCK;
    this._lastSync = null;
    this._listeners = new Set();
    this._rawJiraData = null;
    this._apiStatus = 'disconnected';
    this._config = null;
    this._apiBase = '/api/jira';
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _notify() { this._listeners.forEach(fn => fn()); }

  get source() { return this._source; }
  get lastSync() { return this._lastSync; }
  get apiStatus() { return this._apiStatus; }
  get config() { return this._config; }

  /**
   * Carrega dados do mock (fallback)
   */
  loadMockData() {
    import('./mock-data.js').then(({ MOCK_PROJECTS, MOCK_CARDS, MOCK_USERS }) => {
      this._projects = [...MOCK_PROJECTS];
      this._cards = [...MOCK_CARDS];
      this._users = [...MOCK_USERS];
      this._source = DataSourceType.MOCK;
      this._lastSync = new Date().toISOString();
      this._notify();
    });
  }

  /**
   * Carrega configuração do Jira
   */
  async loadConfig() {
    try {
      const response = await fetch(`${this._apiBase}/config`);
      
      // Validar content-type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[DataService] Config response not JSON:', text.substring(0, 100));
        return null;
      }
      
      const config = await response.json();
      this._config = config;
      this._notify();
      
      // Detectar se é produção
      if (config.isProduction) {
        console.log('[DataService] Running in production mode');
      }
      
      // Se source = env ou missing, não é editável
      if (config.source === 'env' || config.isProduction) {
        console.log('[DataService] Config loaded from environment variables');
      }
      
      return config;
    } catch (error) {
      console.error('[DataService] Erro ao carregar configuração:', error.message);
    }
    return null;
  }

/**
   * Salva configuração do Jira
   */
  async saveConfig(config) {
    try {
      const response = await fetch(`${this._apiBase}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Resposta inválida do servidor');
      }
      
      const result = await response.json();
      
      // Se retornou 403 ou message de produção, não é erro crítico
      if (response.status === 403 || result.message?.includes('produção')) {
        // Apenas recarrega configuração
        await this.loadConfig();
        return result;
      }
      
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Erro ao salvar configuração');
      }
      
      this._config = result;
      this._notify();
      return result;
    } catch (error) {
      console.error('[DataService] Erro ao salvar configuração:', error.message);
      throw error;
    }
  }
      
      const result = await response.json();
      
      // Se retornou 403 ou message de produção, não é erro crítico
      if (response.status === 403 || result.message?.includes('produção')) {
        // Apenas recarrega configuração
        await this.loadConfig();
        return result;
      }
      
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Erro ao salvar configuração');
      }
      
      this._config = result;
      this._notify();
      return result;
    } catch (error) {
      console.error('[DataService] Erro ao salvar configuração:', error.message);
      throw error;
    }
  }
    } catch (error) {
      console.error('[DataService] Erro ao salvar configuração:', error.message);
      throw error;
    }
  }

  /**
   * Testa conexão com o Jira
   */
  async testConnection(config) {
    try {
      const response = await fetch(`${this._apiBase}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      // Validar content-type antes de parsear JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[DataService] Resposta não é JSON:', text.substring(0, 200));
        throw new Error(`Erro ao testar conexão: resposta inválida do servidor (${response.status})`);
      }
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao testar conexão');
      }
      
      return result;
    } catch (error) {
      console.error('[DataService] Erro ao testar conexão:', error.message);
      throw error;
    }
  }

  /**
   * Sincroniza dados do Jira
   */
  async syncFromJira() {
    try {
      const response = await fetch(`${this._apiBase}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Validar content-type antes deParsear JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[DataService] Resposta não é JSON:', text.substring(0, 200));
        throw new Error(`Erro ao sincronizar: resposta inválida do servidor (${response.status})`);
      }
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao sincronizar');
      }
      
      // Carrega os dados do dashboard após sincronização
      await this.loadJiraData();
      
      return result;
    } catch (error) {
      console.error('[DataService] Erro ao sincronizar:', error.message);
      throw error;
    }
  }

  /**
   * Verifica status da sincronização
   */
  async getSyncStatus() {
    try {
      const response = await fetch(`${this._apiBase}/sync/status`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('[DataService] Erro ao buscar status:', error.message);
    }
    return { isConfigured: false, lastSync: null };
  }

  /**
   * Limpa o cache
   */
  async clearCache() {
    try {
      const response = await fetch(`${this._apiBase}/cache/clear`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      console.error('[DataService] Erro ao limpar cache:', error.message);
      throw error;
    }
  }

  /**
   * Carrega dados do Jira via API interna
   */
  async loadJiraData() {
    try {
      const response = await fetch(`${this._apiBase}/dashboard`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao buscar dados do Jira');
      }
      
      const data = await response.json();
      this._rawJiraData = data;
      this.transformJiraData(data);
      this._source = DataSourceType.API;
      this._lastSync = data.lastSyncedAt;
      this._apiStatus = 'connected';
      this._notify();
      
      return data;
    } catch (error) {
      console.error('[DataService] Erro ao carregar dados do Jira:', error.message);
      this._apiStatus = 'error';
      
      if (this._cards.length === 0) {
        this.loadMockData();
      }
      throw error;
    }
  }

  /**
   * Transforma dados brutos do Jira para o formato interno
   */
  transformJiraData(jiraData) {
    const { issues, projects: jiraProjects, analysts: jiraAnalysts } = jiraData;
    
    // Transformar projetos
    this._projects = jiraProjects.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: '',
      lead: null,
      statusFlow: [],
      createdAt: new Date().toISOString(),
      avatarUrl: p.avatar
    }));
    
    // Transformar usuários/analistas
    this._users = jiraAnalysts.map(a => ({
      id: a.id,
      displayName: a.name,
      email: a.email || '',
      avatarUrl: a.avatar,
      active: true
    }));
    
    // Adicionar "Não atribuído" como usuário
    const unassignedCount = issues.filter(i => !i.assignee).length;
    if (unassignedCount > 0) {
      this._users.push({
        id: 'unassigned',
        displayName: 'Não Atribuído',
        email: '',
        avatarUrl: null,
        active: true
      });
    }
    
    // Transformar cards/issues
    this._cards = issues.map(i => ({
      id: i.id,
      key: i.key,
      projectId: this.findProjectIdByKey(i.project.key),
      title: i.title,
      description: '',
      assigneeId: i.assignee?.id || 'unassigned',
      status: i.status.name,
      priority: this.mapPriority(i.priority?.name),
      type: this.mapIssueType(i.type.name),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      dueDate: i.resolvedAt,
      sprint: null,
      storyPoints: 0,
      labels: i.labels || [],
      timeEstimated: 0,
      timeSpent: 0,
      epicKey: i.parent?.key || null
    }));
  }

  findProjectIdByKey(key) {
    const project = this._projects.find(p => p.key === key);
    return project ? project.id : key;
  }

  mapPriority(priorityName) {
    if (!priorityName) return 'medium';
    const name = priorityName.toLowerCase();
    if (name.includes('highest') || name.includes('critic')) return 'highest';
    if (name.includes('high')) return 'high';
    if (name.includes('low')) return 'low';
    if (name.includes('lowest')) return 'lowest';
    return 'medium';
  }

  mapIssueType(typeName) {
    if (!typeName) return 'task';
    const name = typeName.toLowerCase();
    if (name.includes('story')) return 'story';
    if (name.includes('bug') || name.includes('defect')) return 'bug';
    if (name.includes('epic')) return 'epic';
    if (name.includes('subtask')) return 'subtask';
    return 'task';
  }

  importData(projects, cards, users) {
    const projectIds = new Set(projects.map(p => p.id));
    const invalid = cards.filter(c => !projectIds.has(c.projectId));
    if (invalid.length > 0) {
      throw new Error(`${invalid.length} card(s) sem projeto válido: ${invalid.map(c=>c.key).join(', ')}`);
    }
    this._projects = [...projects];
    this._cards = [...cards];
    this._users = [...users];
    this._source = DataSourceType.IMPORTED;
    this._lastSync = new Date().toISOString();
    this._notify();
  }

  getProjects() { return [...this._projects]; }
  getProjectById(id) { return this._projects.find(p => p.id === id) || null; }
  getProjectByKey(key) { return this._projects.find(p => p.key === key) || null; }

  getProjectStats(projectId) {
    const cards = this.getCardsByProject(projectId);
    const total = cards.length;
    const done = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.DONE).length;
    const inProgress = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.IN_PROGRESS).length;
    const blocked = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.BLOCKED).length;
    const todo = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.TODO).length;
    const overdue = cards.filter(isCardOverdue).length;
    const progress = calculateProjectProgress(cards);
    const health = calculateProjectHealth(cards);
    const team = [...new Set(cards.map(c => c.assigneeId).filter(Boolean))];
    const storyPoints = cards.reduce((sum, c) => sum + (c.storyPoints || 0), 0);
    const storyPointsDone = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.DONE)
      .reduce((sum, c) => sum + (c.storyPoints || 0), 0);

    return { total, done, inProgress, blocked, todo, overdue, progress, health, team, storyPoints, storyPointsDone };
  }

  getProjectsRanked() {
    return this._projects
      .map(p => ({ ...p, stats: this.getProjectStats(p.id) }))
      .sort((a, b) => b.stats.progress - a.stats.progress);
  }

  getCards(filters = {}) {
    let result = [...this._cards];
    if (filters.projectId) result = result.filter(c => c.projectId === filters.projectId);
    if (filters.assigneeId) result = result.filter(c => c.assigneeId === filters.assigneeId);
    if (filters.status) result = result.filter(c => c.status === filters.status);
    if (filters.statusCategory) result = result.filter(c => resolveStatusCategory(c.status) === filters.statusCategory);
    if (filters.priority) result = result.filter(c => c.priority === filters.priority);
    if (filters.type) result = result.filter(c => c.type === filters.type);
    if (filters.overdue) result = result.filter(isCardOverdue);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        (c.labels || []).some(l => l.toLowerCase().includes(q))
      );
    }
    if (filters.sortBy) {
      const dir = filters.sortDir === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        const av = a[filters.sortBy] || '';
        const bv = b[filters.sortBy] || '';
        if (typeof av === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return result;
  }

  getCardsByProject(projectId) { return this._cards.filter(c => c.projectId === projectId); }
  getCardById(id) { return this._cards.find(c => c.id === id) || null; }

  getUsers() { return [...this._users]; }
  getUserById(id) { return this._users.find(u => u.id === id) || null; }

  getUserStats(userId) {
    const cards = this._cards.filter(c => c.assigneeId === userId);
    const total = cards.length;
    const done = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.DONE).length;
    const inProgress = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.IN_PROGRESS).length;
    const overdue = cards.filter(isCardOverdue).length;
    const blocked = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.BLOCKED).length;
    const projects = [...new Set(cards.map(c => c.projectId))];
    const storyPoints = cards.reduce((s, c) => s + (c.storyPoints || 0), 0);
    const storyPointsDone = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.DONE)
      .reduce((s, c) => s + (c.storyPoints || 0), 0);
    const productivity = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, overdue, blocked, projects, storyPoints, storyPointsDone, productivity };
  }

  getUsersRanked() {
    return this._users
      .map(u => ({ ...u, stats: this.getUserStats(u.id) }))
      .sort((a, b) => b.stats.productivity - a.stats.productivity);
  }

  getDashboardStats(projectFilter = null) {
    const cards = projectFilter ? this.getCardsByProject(projectFilter) : [...this._cards];
    const total = cards.length;
    const byCategory = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    const byPriority = { highest: 0, high: 0, medium: 0, low: 0, lowest: 0 };
    let overdue = 0;

    cards.forEach(c => {
      byCategory[resolveStatusCategory(c.status)]++;
      if (byPriority[c.priority] !== undefined) byPriority[c.priority]++;
      if (isCardOverdue(c)) overdue++;
    });

    return { totalProjects: this._projects.length, totalCards: total, byCategory, byPriority, overdue };
  }

  getStatusDistributionByProject() {
    return this._projects.map(p => {
      const cards = this.getCardsByProject(p.id);
      const dist = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
      cards.forEach(c => dist[resolveStatusCategory(c.status)]++);
      return { project: p, distribution: dist };
    });
  }

  getCardsByStatusGrouped(projectId = null) {
    const cards = projectId ? this.getCardsByProject(projectId) : [...this._cards];
    const statuses = [...new Set(cards.map(c => c.status))];
    return statuses.map(s => ({ status: s, count: cards.filter(c => c.status === s).length }));
  }

  getWorkloadByAnalyst(projectId = null) {
    const cards = projectId ? this.getCardsByProject(projectId) : [...this._cards];
    return this._users.map(u => {
      const userCards = cards.filter(c => c.assigneeId === u.id);
      return { user: u, total: userCards.length, inProgress: userCards.filter(c => resolveStatusCategory(c.status) === StatusCategory.IN_PROGRESS).length };
    }).filter(w => w.total > 0);
  }

  getRawJiraData() {
    return this._rawJiraData;
  }

  getBoardData() {
    if (this._rawJiraData?.board) {
      return this._rawJiraData.board;
    }
    return { columns: [] };
  }

  getMetrics() {
    if (this._rawJiraData?.metrics) {
      return this._rawJiraData.metrics;
    }
    return {};
  }

  async refreshFromJira() {
    try {
      await this.clearCache();
      return await this.loadJiraData();
    } catch (error) {
      console.error('[DataService] Erro ao fazer refresh:', error);
      return null;
    }
  }

  /**
   * Verifica se um status é considerado "concluído"
   */
  isDoneStatus(statusName) {
    if (!statusName) return false;
    const name = statusName.toLowerCase();
    return (
      name.includes('done') ||
      name.includes('concluído') ||
      name.includes('finalizado') ||
      name.includes('closed') ||
      name.includes('resolved')
    );
  }

  /**
   * Cria o resumo executivo de um projeto
   */
  buildProjectExecutiveSummary(projectKey) {
    const rawData = this._rawJiraData;
    
    if (!rawData || !rawData.issues) {
      return null;
    }

    // Filtrar apenas issues do projeto selecionado
    const projectIssues = rawData.issues.filter(i => i.project.key === projectKey);
    
    if (projectIssues.length === 0) {
      return null;
    }

    const project = projectIssues[0].project;
    const totals = {
      issues: projectIssues.length,
      done: 0,
      inProgress: 0,
      blocked: 0,
      unassigned: 0,
      notStarted: 0,
      ready4Test: 0,
      validation: 0,
      cancelled: 0
    };

    // Contagem por status
    const statusCounts = {};
    const priorityCounts = {};
    
    projectIssues.forEach(issue => {
      const statusName = issue.status.name;
      const statusCategory = issue.status.category?.toLowerCase() || '';
      
      // Contagem totals
      if (this.isDoneStatus(statusName)) {
        totals.done++;
      } else if (statusCategory.includes('block')) {
        totals.blocked++;
      } else if (statusCategory.includes('indeterminate') || statusName.toLowerCase().includes('progress')) {
        totals.inProgress++;
      } else if (statusName.toLowerCase().includes('ready') || statusName.toLowerCase().includes('test') || statusName.toLowerCase().includes('qa')) {
        totals.ready4Test++;
      } else if (statusName.toLowerCase().includes('valida') || statusName.toLowerCase().includes('cliente')) {
        totals.validation++;
      } else if (statusName.toLowerCase().includes('cancel')) {
        totals.cancelled++;
      } else {
        totals.notStarted++;
      }

      // Contagem por status detalhado
      if (!statusCounts[statusName]) {
        statusCounts[statusName] = 0;
      }
      statusCounts[statusName]++;

      // Contagem por prioridade
      if (issue.priority?.name) {
        if (!priorityCounts[issue.priority.name]) {
          priorityCounts[issue.priority.name] = 0;
        }
        priorityCounts[issue.priority.name]++;
      }

      // Não atribuído
      if (!issue.assignee) {
        totals.unassigned++;
      }
    });

    // Calcular percentual de conclusão
    const progressPercent = totals.issues > 0 
      ? Math.round((totals.done / totals.issues) * 100) 
      : 0;

    // Determinar saúde do projeto (semáforo)
    let healthStatus = 'green';
    let healthLabel = 'No prazo';
    
    if (totals.blocked >= 3 || progressPercent < 30) {
      healthStatus = 'red';
      healthLabel = 'Crítico';
    } else if (totals.blocked > 0 || (progressPercent >= 30 && progressPercent < 60)) {
      healthStatus = 'yellow';
      healthLabel = 'Atenção';
    }

    // Breakdown por status
    const statusBreakdown = Object.entries(statusCounts).map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / totals.issues) * 100)
    })).sort((a, b) => b.count - a.count);

    // Time do projeto
    const teamMap = {};
    projectIssues.forEach(issue => {
      if (issue.assignee) {
        const id = issue.assignee.id;
        if (!teamMap[id]) {
          teamMap[id] = {
            id: issue.assignee.id,
            name: issue.assignee.name,
            avatar: issue.assignee.avatar,
            totalTickets: 0,
            statusMain: null
          };
        }
        teamMap[id].totalTickets++;
        
        // Status principal do analista
        const statusCat = issue.status.category?.toLowerCase() || '';
        if (this.isDoneStatus(issue.status.name)) {
          teamMap[id].statusMain = 'Concluído';
        } else if (statusCat.includes('block')) {
          teamMap[id].statusMain = 'Bloqueado';
        } else if (statusCat.includes('indeterminate')) {
          teamMap[id].statusMain = 'Em progresso';
        }
      }
    });
    const team = Object.values(teamMap).sort((a, b) => b.totalTickets - a.totalTickets);

    // Riscos e problemas
    const risks = [];
    projectIssues.forEach(issue => {
      const statusName = issue.status.name.toLowerCase();
      const priorityName = issue.priority?.name?.toLowerCase() || '';
      const isBlocked = statusName.includes('block');
      const isHighPriority = priorityName.includes('high') || priorityName.includes('critic') || priorityName.includes('alta') || priorityName.includes('crítica');
      const isOld = issue.updatedAt && (Date.now() - new Date(issue.updatedAt).getTime()) > 30 * 24 * 60 * 60 * 1000; // > 30 dias
      const isUnassigned = !issue.assignee;

      if (isBlocked || isHighPriority || (isOld && !this.isDoneStatus(issue.status.name))) {
        let level = 'Baixo';
        let reason = '';

        if (isBlocked) {
          level = 'Alto';
          reason = 'Ticket bloqueado';
        } else if (isHighPriority && !this.isDoneStatus(issue.status.name)) {
          level = 'Alto';
          reason = `Prioridade ${issue.priority?.name || 'Alta'}`;
        } else if (isOld) {
          level = 'Médio';
          reason = 'Sem atualização há mais de 30 dias';
        }

        if (reason) {
          risks.push({
            level,
            key: issue.key,
            title: issue.title,
            reason,
            assignee: issue.assignee?.name || 'Não atribuído'
          });
        }
      }
    });
    risks.sort((a, b) => {
      const levelOrder = { 'Alto': 0, 'Médio': 1, 'Baixo': 2 };
      return levelOrder[a.level] - levelOrder[b.level];
    });

    // Últimas conquistas (tickets concluídos recentemente)
    const achievements = projectIssues
      .filter(i => this.isDoneStatus(i.status.name) && i.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))
      .slice(0, 5)
      .map(i => ({
        key: i.key,
        title: i.title,
        resolvedAt: i.resolvedAt
      }));

    // Próximos passos (tickets não concluídos)
    const nextSteps = projectIssues
      .filter(i => !this.isDoneStatus(i.status.name))
      .sort((a, b) => {
        // Prioridade primeiro
        const priorityOrder = { 'Highest': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Lowest': 4 };
        const aPriority = priorityOrder[a.priority?.name] ?? 5;
        const bPriority = priorityOrder[b.priority?.name] ?? 5;
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Depois por data de atualização
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      })
      .slice(0, 5)
      .map(i => ({
        key: i.key,
        title: i.title,
        status: i.status.name,
        priority: i.priority?.name || 'Medium'
      }));

    // Período analisado
    const dates = projectIssues
      .map(i => i.createdAt)
      .filter(Boolean)
      .map(d => new Date(d))
      .sort((a, b) => a - b);
    
    const period = {
      start: dates[0] ? dates[0].toISOString() : null,
      end: dates[dates.length - 1] ? dates[dates.length - 1].toISOString() : null
    };

    // Prioridade predominante
    const predominantPriority = Object.entries(priorityCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Insights textuais
    const insights = [
      `O projeto possui ${totals.issues} tickets, sendo ${totals.done} concluídos, ${totals.inProgress} em andamento e ${totals.blocked} bloqueados.`
    ];
    
    if (totals.unassigned > 0) {
      insights.push(`${totals.unassigned} tickets sem responsável.`);
    }
    
    if (predominantPriority) {
      insights.push(`Prioridade predominante: ${predominantPriority}.`);
    }
    
    if (rawData.lastSyncedAt) {
      const syncDate = new Date(rawData.lastSyncedAt).toLocaleDateString('pt-BR');
      insights.push(`Última atualização dos dados: ${syncDate}.`);
    }

    return {
      project: {
        id: project.id,
        key: project.key,
        name: project.name,
        avatar: project.avatar
      },
      period,
      progressPercent,
      healthStatus,
      healthLabel,
      totals,
      statusBreakdown,
      team,
      risks,
      achievements,
      nextSteps,
      insights,
      lastSync: rawData.lastSyncedAt,
      predominantPriority
    };
  }

  /**
   * Get project by key
   */
  getProjectByKey(key) {
    return this._projects.find(p => p.key === key) || null;
  }
}

export const dataService = new DataService();