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
    this._source = DataSourceType.EMPTY;
    this._lastSync = null;
    this._listeners = new Set();
    this._rawJiraData = null;
    this._apiStatus = 'disconnected';
    this._config = null;
    this._apiBase = '/api/jira';
    this._loadPromise = null;
    this._loadError = null;
    this._hasLoaded = false;
    this._version = 0;
    this._rawIssueById = new Map();
    this._derived = null;
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _notify() { this._listeners.forEach(fn => fn()); }
  _invalidateDerived() {
    this._version++;
    this._derived = null;
  }

  _ensureDerived() {
    if (this._derived?.version === this._version) return this._derived;

    const projectById = new Map();
    const projectByKey = new Map();
    const userById = new Map();
    const cardsByProject = new Map();
    const cardsByAssignee = new Map();
    const statusSet = new Set();

    this._projects.forEach(project => {
      projectById.set(project.id, project);
      projectByKey.set(project.key, project);
    });

    this._users.forEach(user => userById.set(user.id, user));

    this._cards.forEach(card => {
      if (!cardsByProject.has(card.projectId)) cardsByProject.set(card.projectId, []);
      cardsByProject.get(card.projectId).push(card);

      if (!cardsByAssignee.has(card.assigneeId)) cardsByAssignee.set(card.assigneeId, []);
      cardsByAssignee.get(card.assigneeId).push(card);

      if (card.status) statusSet.add(card.status);
    });

    this._derived = {
      version: this._version,
      projectById,
      projectByKey,
      userById,
      cardsByProject,
      cardsByAssignee,
      statusOptions: [...statusSet].sort(),
      projectStats: new Map(),
      userStats: new Map(),
      projectsRanked: null,
      usersRanked: null
    };

    return this._derived;
  }

  _setCollections({ projects, cards, users }) {
    this._projects = projects || [];
    this._cards = cards || [];
    this._users = users || [];
    this._invalidateDerived();
  }

  get source() { return this._source; }
  get lastSync() { return this._lastSync; }
  get apiStatus() { return this._apiStatus; }
  get config() { return this._config; }
  get isLoaded() { return this._hasLoaded; }
  get loadError() { return this._loadError; }

  /**
   * Carrega dados do mock (fallback)
   */
  loadMockData() {
    import('./mock-data.js').then(({ MOCK_PROJECTS, MOCK_CARDS, MOCK_USERS }) => {
      this._setCollections({
        projects: [...MOCK_PROJECTS],
        cards: [...MOCK_CARDS],
        users: [...MOCK_USERS]
      });
      this._source = DataSourceType.MOCK;
      this._lastSync = new Date().toISOString();
      this._notify();
    });
  }

  /**
   * Retorna os headers com sessão
   */
  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const sessionId = localStorage.getItem('sessionId');
    if (sessionId) {
      headers['x-session-id'] = sessionId;
    }
    return headers;
  }

  /**
   * Carrega configuração do Jira (Depreciado - agora stateless)
   */
  async loadConfig() {
    // Agora retornamos apenas um esqueleto para não quebrar o frontend
    // mas sem tentar fazer fetch em endpoint que retornaria 404
    this._config = { source: 'form', isProduction: true };
    this._notify();
    return this._config;
  }

  /**
   * Salva configuração do Jira
   */
  async saveConfig(config) {
    try {
      const response = await fetch(`${this._apiBase}/config`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(config)
      });
      
      // Validar content-type antes de parsear JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[DataService] SaveConfig response not JSON:', text.substring(0, 200));
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

  /**
   * Testa conexão com o Jira
   */
  async testJiraConnection(credentials) {
    try {
      // Sanitização básica no frontend
      let { baseUrl } = credentials;
      if (baseUrl) {
        baseUrl = baseUrl.trim().toLowerCase();
        if (!baseUrl.startsWith('http')) {
          baseUrl = `https://${baseUrl}`;
        }
        // Remover barra final se existir
        baseUrl = baseUrl.replace(/\/$/, '');
        credentials.baseUrl = baseUrl;
      }

      const response = await fetch(`${this._apiBase}/test-connection`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(credentials)
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
   * NOTA: Agora envia as credenciais do frontend explicitamente,
   * garantindo que não estamos salvando ou usando credenciais em cache.
   * @param {Object} credentials - As credenciais para sincronização
   */
  async syncFromJira(credentials) {
    return this.startJiraSync(credentials);
  }

  /**
   * Inicia sincronizacao no backend e retorna o jobId.
   */
  async startJiraSync(credentials) {
    try {
      // Sanitização básica no frontend
      let { baseUrl } = credentials;
      if (baseUrl) {
        baseUrl = baseUrl.trim().toLowerCase();
        if (!baseUrl.startsWith('http')) {
          baseUrl = `https://${baseUrl}`;
        }
        // Remover barra final
        baseUrl = baseUrl.replace(/\/$/, '');
        credentials.baseUrl = baseUrl;
      }

      const response = await fetch(`${this._apiBase}/sync`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(credentials)
      });
      
      // Validar content-type antes de parsear JSON
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

      return result;
    } catch (error) {
      console.error('[DataService] Erro ao iniciar sincronizacao:', error.message);
      throw error;
    }
  }

  /**
   * Verifica status da sincronização
   */
  async getSyncStatus(jobId = null) {
    try {
      const url = jobId
        ? `${this._apiBase}/sync/status?jobId=${encodeURIComponent(jobId)}`
        : `${this._apiBase}/sync/status`;

      const response = await fetch(url, {
        headers: this._getHeaders()
      });
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
        method: 'POST',
        headers: this._getHeaders()
      });
      return await response.json();
    } catch (error) {
      console.error('[DataService] Erro ao limpar cache:', error.message);
      throw error;
}
  }

  /**
   * Fetch com timeout para evitar travamento eterno
   */
  async _fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * Carrega dados do Jira via API interna
   */
  async loadJiraData() {
    try {
      const response = await this._fetchWithTimeout(`${this._apiBase}/dashboard`, {
        headers: this._getHeaders()
      }, 10000);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erro ao buscar dados do Jira');
      }
      
      const data = await response.json();
      this._rawJiraData = data;
      this.transformJiraData(data);
      this._source = DataSourceType.API;
      this._lastSync = data.lastSyncedAt;
      this._apiStatus = 'connected';
      this._loadError = null;
      this._hasLoaded = true;
      this._notify();
      
      return data;
    } catch (error) {
      console.error('[DataService] Erro ao carregar dados do Jira:', error.message);
      this._apiStatus = 'error';
      this._loadError = error;
      
      // NÃO carregar mock automaticamente - deixa vazio se não houver dados
      // O usuário deve sincronizar explicitamente
      if (!this._hasLoaded) {
        this._setCollections({ projects: [], cards: [], users: [] });
        this._source = DataSourceType.EMPTY;
      }
      this._notify();
      
      throw error;
    } finally {
      this._loadPromise = null;
    }
  }

  /**
   * Garante reidratacao unica do estado em memoria a partir do backend.
   */
  async ensureLoaded({ force = false } = {}) {
    if (!force && this._hasLoaded) return this._rawJiraData;
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = this.loadJiraData();
    return this._loadPromise;
  }

  /**
   * Transforma dados brutos do Jira para o formato interno
   */
  transformJiraData(jiraData) {
    const { issues, projects: jiraProjects, analysts: jiraAnalysts } = jiraData;
    const projectByKey = new Map();
    this._rawIssueById = new Map();
    
    // Transformar projetos
    const projects = jiraProjects.map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: '',
      lead: null,
      statusFlow: [],
      createdAt: new Date().toISOString(),
      avatarUrl: p.avatar
    }));
    projects.forEach(project => projectByKey.set(project.key, project));
    
    // Transformar usuários/analistas
    const users = jiraAnalysts.map(a => ({
      id: a.id,
      displayName: a.name,
      email: a.email || '',
      avatarUrl: a.avatar,
      active: true
    }));
    
    // Adicionar "Não atribuído" como usuário
    const unassignedCount = issues.filter(i => !(i.assignee_id || i.assignee?.id)).length;
    if (unassignedCount > 0) {
      users.push({
        id: 'unassigned',
        displayName: 'Não Atribuído',
        email: '',
        avatarUrl: null,
        active: true
      });
    }
    
    // Transformar cards/issues
    // Formato flat (do banco Supabase): issue.project_key, issue.status_name, etc.
    const cards = issues.map(i => {
      const projectKey  = i.project_key || '';
      const assigneeId  = i.assignee_id || null;
      const statusName  = i.status_name || 'Unknown';
      const priorityName = i.priority_name || null;
      const typeName    = i.type_name || 'Task';
      const createdAt   = i.jira_created_at;
      const updatedAt   = i.jira_updated_at;
      const resolvedAt  = i.jira_resolved_at;
      const dueDate     = i.due_date;
      const plannedStartDate = i.planned_start_date || i.start_date || i.plannedStartDate || i.startDate || null;
      const plannedEndDate = i.planned_end_date || i.plannedEndDate || dueDate || null;
      const parentKey   = i.parent_key || null;
      const issueId     = i.issue_id;
      const issueKey    = i.issue_key;
      this._rawIssueById.set(issueId, i);

      const isInconsistent = !assigneeId || 
                             !priorityName || 
                             !dueDate || 
                             (statusName.toLowerCase().includes('progress') && !assigneeId) ||
                             statusName === 'Unknown';

      return {
        id: issueId,
        key: issueKey,
        projectId: projectByKey.get(projectKey)?.id || projectKey,
        title: i.title || '',
        description: '',
        assigneeId: assigneeId || 'unassigned',
        status: statusName,
        priority: this.mapPriority(priorityName),
        type: this.mapIssueType(typeName),
        createdAt,
        updatedAt,
        resolvedAt,
        dueDate,
        startDate: plannedStartDate,
        plannedStartDate,
        plannedEndDate,
        dateSource: plannedStartDate ? 'jira' : 'created_at_fallback',
        jiraUrl: i.jira_url || i.jiraUrl || null,
        rawFields: i.raw_fields || i.rawFields || null,
        sprint: null,
        storyPoints: 0,
        labels: i.labels || [],
        timeEstimated: 0,
        timeSpent: 0,
        epicKey: parentKey,
        isInconsistent
      };
    });
    this._setCollections({ projects, cards, users });
  }

  findProjectIdByKey(key) {
    const project = this._ensureDerived().projectByKey.get(key);
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
    this._setCollections({
      projects: [...projects],
      cards: [...cards],
      users: [...users]
    });
    this._source = DataSourceType.IMPORTED;
    this._lastSync = new Date().toISOString();
    this._notify();
  }

  getProjects() { return [...this._projects]; }
  getProjectById(id) { return this._ensureDerived().projectById.get(id) || null; }
  getProjectByKey(key) { return this._ensureDerived().projectByKey.get(key) || null; }

  getProjectStats(projectId) {
    const derived = this._ensureDerived();
    if (derived.projectStats.has(projectId)) return derived.projectStats.get(projectId);

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

    const stats = { total, done, inProgress, blocked, todo, overdue, progress, health, team, storyPoints, storyPointsDone };
    derived.projectStats.set(projectId, stats);
    return stats;
  }

  getProjectsRanked() {
    const derived = this._ensureDerived();
    if (!derived.projectsRanked) {
      derived.projectsRanked = this._projects
      .map(p => ({ ...p, stats: this.getProjectStats(p.id) }))
      .sort((a, b) => b.stats.progress - a.stats.progress);
    }
    return [...derived.projectsRanked];
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

  getCardsByProject(projectId) { return [...(this._ensureDerived().cardsByProject.get(projectId) || [])]; }
  getCardById(id) { return this._cards.find(c => c.id === id) || null; }

  getUsers() { return [...this._users]; }
  getUserById(id) { return this._ensureDerived().userById.get(id) || null; }
  getStatusOptions() { return [...this._ensureDerived().statusOptions]; }

  getUserStats(userId) {
    const derived = this._ensureDerived();
    if (derived.userStats.has(userId)) return derived.userStats.get(userId);

    const cards = derived.cardsByAssignee.get(userId) || [];
    const total = cards.length;
    const done = cards.filter(c => {
      const s = (c.status || '').toLowerCase();
      return s.includes('conclui') || s.includes('done') || s.includes('finalizado') || s.includes('resolved') || s.includes('fechado') || s.includes('closed');
    }).length;

    const canceled = cards.filter(c => {
      const s = (c.status || '').toLowerCase();
      return s.includes('cancel') || s.includes('rejeit') || s.includes('abandon') || s.includes('aborted');
    }).length;
    const inProgress = total - (done + canceled);
    const overdue = cards.filter(isCardOverdue).length;
    const blocked = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.BLOCKED).length;
    const projects = [...new Set(cards.map(c => c.projectId))];
    const storyPoints = cards.reduce((s, c) => s + (c.storyPoints || 0), 0);
    const storyPointsDone = cards.filter(c => resolveStatusCategory(c.status) === StatusCategory.DONE)
      .reduce((s, c) => s + (c.storyPoints || 0), 0);
    const productivity = total > 0 ? Math.round((done / total) * 100) : 0;
    const stats = { total, done, inProgress, overdue, blocked, projects, storyPoints, storyPointsDone, productivity };
    derived.userStats.set(userId, stats);
    return stats;
  }

  getUsersRanked() {
    const derived = this._ensureDerived();
    if (!derived.usersRanked) {
      derived.usersRanked = this._users
      .map(u => ({ ...u, stats: this.getUserStats(u.id) }))
      .sort((a, b) => b.stats.productivity - a.stats.productivity);
    }
    return [...derived.usersRanked];
  }

  getDashboardStats(projectFilter = null) {
    const cards = projectFilter ? this.getCardsByProject(projectFilter) : [...this._cards];
    const total = cards.length;
    const byCategory = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
    const byPriority = { highest: 0, high: 0, medium: 0, low: 0, lowest: 0 };
    let overdue = 0;
    let inconsistent = 0;

    cards.forEach(c => {
      byCategory[resolveStatusCategory(c.status)]++;
      if (byPriority[c.priority] !== undefined) byPriority[c.priority]++;
      if (isCardOverdue(c)) overdue++;
      if (c.isInconsistent) inconsistent++;
    });

    return { 
      totalProjects: this._projects.length, 
      totalCards: total, 
      byCategory, 
      byPriority, 
      overdue, 
      inconsistent,
      inconsistentTickets: cards.filter(c => c.isInconsistent)
    };
  }

  /**
   * Retorna resumo de tickets com problemas para auditoria
   */
  getDataHealthSummary(projectId = null) {
    const cards = projectId ? this.getCardsByProject(projectId) : [...this._cards];
    
    return {
      noAssignee: cards.filter(c => !c.assigneeId || c.assigneeId === 'unassigned'),
      noPriority: cards.filter(c => !c.priority || (c.priority === 'medium' && !this._rawIssueById.get(c.id)?.priority_name)),
      noDueDate: cards.filter(c => !c.dueDate),
      stuckInProgress: cards.filter(c => c.status.toLowerCase().includes('progress') && (!c.assigneeId || c.assigneeId === 'unassigned')),
      unknownStatus: cards.filter(c => c.status === 'Unknown' || resolveStatusCategory(c.status) === StatusCategory.TODO && c.status.toLowerCase().includes('unknown'))
    };
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
   * Retorna metadados da última sincronização.
   * Consolida informações de sync de múltiplas fontes.
   */
  getSyncMetadata() {
    const job = this._rawJiraData?.syncJob || null;
    return {
      lastSyncedAt: this._lastSync || this._rawJiraData?.lastSyncedAt || job?.finishedAt || null,
      lastSyncStatus: this._rawJiraData?.lastSyncStatus || job?.status || null,
      totalIssues: this._rawJiraData?.totalIssues || job?.totalIssues || this._cards.length,
      inserted: job?.inserted || 0,
      updated: job?.updated || 0,
      error: job?.error || this._rawJiraData?.lastSyncError || null,
      jobId: job?.id || null
    };
  }

  /**
   * Remove diacríticos (acentos) de uma string para comparação normalizada.
   * @param {string} str - Texto com possíveis acentos
   * @returns {string} Texto sem acentos, em lowercase
   */
  _stripDiacritics(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Verifica se um status é considerado "concluído".
   * Normaliza acentos para cobrir variações como 'concluído' e 'concluido'.
   */
  isDoneStatus(statusName) {
    if (!statusName) return false;
    const name = this._stripDiacritics(statusName.toLowerCase());
    return (
      name.includes('done') ||
      name.includes('concluido') ||
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

    // ═══════════════════════════════════════════════
    // FAROL DO PROJETO — Planejamento vs Execução
    // Referência: D-1 (ontem), calculado dinamicamente
    // ═══════════════════════════════════════════════
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999); // Fim do dia de ontem

    let deveriaConcluido = 0;
    let realmenteConcluido = 0;

    projectIssues.forEach(issue => {
      // O campo dueDate pode vir tanto do formato flat (due_date) quanto aninhado (dueDate)
      const dueDate = issue.dueDate || issue.due_date || null;
      if (!dueDate) return;

      const dueDateParsed = new Date(dueDate);
      if (isNaN(dueDateParsed.getTime())) return; // Data inválida — ignorar

      if (dueDateParsed <= yesterday) {
        deveriaConcluido++;
        // Extrair nome do status de forma segura — issue.status pode ser objeto ou string
        const statusName = typeof issue.status === 'object' ? issue.status?.name : (issue.status_name || issue.status || '');
        if (this.isDoneStatus(statusName)) {
          realmenteConcluido++;
        }
      }
    });

    let diferencaPercentual = 0;
    if (deveriaConcluido > 0) {
      const percentualExecucao = (realmenteConcluido / deveriaConcluido) * 100;
      diferencaPercentual = Math.max(0, Math.round((100 - percentualExecucao) * 100) / 100);
    }

    let farolCor = 'green';
    let farolLabel = 'Verde';
    if (diferencaPercentual > 3) {
      farolCor = 'red';
      farolLabel = 'Vermelho';
    } else if (diferencaPercentual > 1) {
      farolCor = 'yellow';
      farolLabel = 'Amarelo';
    }

    const farol = {
      cor: farolCor,
      label: farolLabel,
      deveriaConcluido,
      realmenteConcluido,
      diferencaPercentual,
      dataReferencia: yesterday.toISOString()
    };

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
      predominantPriority,
      farol
    };
  }

}

export const dataService = new DataService();
