/**
 * data-service.js — Camada de abstração de dados
 * 
 * Ponto único de acesso aos dados do sistema.
 * Permite troca transparente entre mock, importação e API futura.
 * Toda lógica de negócio de consulta centralizada aqui.
 */
import { MOCK_PROJECTS, MOCK_CARDS, MOCK_USERS } from './mock-data.js';
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
    this.loadMockData();
  }

  // ─── Eventos ──────────────────────────────────────────
  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _notify() { this._listeners.forEach(fn => fn()); }

  // ─── Fonte de Dados ───────────────────────────────────
  get source() { return this._source; }
  get lastSync() { return this._lastSync; }

  loadMockData() {
    this._projects = [...MOCK_PROJECTS];
    this._cards = [...MOCK_CARDS];
    this._users = [...MOCK_USERS];
    this._source = DataSourceType.MOCK;
    this._lastSync = new Date().toISOString();
    this._notify();
  }

  importData(projects, cards, users) {
    // Validação: todo card deve ter projectId válido
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

  // ─── Projetos ─────────────────────────────────────────
  getProjects() { return [...this._projects]; }
  getProjectById(id) { return this._projects.find(p => p.id === id) || null; }

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

  // ─── Cards ────────────────────────────────────────────
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

  // ─── Usuários / Analistas ─────────────────────────────
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

  // ─── Agregações para Dashboard ────────────────────────
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
}

// Singleton
export const dataService = new DataService();
