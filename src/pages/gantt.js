/**
 * gantt.js — Módulo Gantt profissional e corporativo
 *
 * Timeline com dados reais do Supabase via dataService.
 * Recursos: zoom, resize, agrupamento, busca, personalização,
 * densidade, modal detalhado, tickets sem data, legenda.
 *
 * Arquitetura modular:
 *  - preferences  : persistência em localStorage
 *  - dates        : helpers de data
 *  - timeline     : cálculo de ticks e range
 *  - bars         : renderização de barras
 *  - groups       : agrupamento de tickets
 *  - modal        : tooltip/modal de detalhes
 *  - resize       : redimensionamento de colunas
 *  - settings     : painel de personalização
 *  - filters      : filtros e busca
 *  - summary      : health cards
 *  - render       : orquestração principal
 */
import '../styles/gantt.css';
import { dataService } from '../data/data-service.js';
import {
  resolveStatusCategory, StatusCategory, isCardOverdue
} from '../data/models.js';
import { sanitize, debounce, formatDate, priorityLabel } from '../utils/helpers.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;
const LS_PREFIX = 'gantt.';
const DEFAULT_PREFS = {
  leftColWidth: 400,
  colWidths: {
    key: 90,
    title: 220,
    assignee: 120,
    project: 100,
    status: 100,
    priority: 90,
    startDate: 90,
    endDate: 90,
    duration: 70,
    progress: 70,
  },
  timelineCellWidth: 40,
  rowHeight: 52,
  density: 'normal',
  viewMode: 'week',
  grouping: 'none',
  collapsedGroups: {},
  visibleCols: ['key', 'title', 'assignee', 'status', 'priority'],
  showNoDateTickets: true,
  noDateSectionCollapsed: false,
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const COLUMN_METADATA = {
  key: { label: 'Key', resizable: true },
  title: { label: 'Título', resizable: true },
  assignee: { label: 'Analista', resizable: true },
  project: { label: 'Projeto', resizable: true },
  status: { label: 'Status', resizable: true },
  priority: { label: 'Prioridade', resizable: true },
  startDate: { label: 'Início', resizable: true },
  endDate: { label: 'Previsão', resizable: true },
  duration: { label: 'Dur.', resizable: true },
  progress: { label: 'Prog.', resizable: true },
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const state = {
  // Filtros
  projectId: '',
  analystId: '',
  status: '',
  priority: '',
  period: 'all',
  searchQuery: '',

  // Dados processados
  allItems: [],
  filteredItems: [],
  currentRange: null,
  currentTicks: [],

  // Preferências (carregadas do localStorage)
  prefs: { ...DEFAULT_PREFS },
};

// ═══════════════════════════════════════════════════════════════
// PREFERENCES — Sistema de persistência
// ═══════════════════════════════════════════════════════════════

const Preferences = {
  load() {
    try {
      const saved = {};
      for (const key of Object.keys(DEFAULT_PREFS)) {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (raw !== null) {
          try { saved[key] = JSON.parse(raw); }
          catch { saved[key] = raw; }
        }
      }
      // Merge com defaults (preenche valores faltando)
      return { ...DEFAULT_PREFS, ...saved };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  },

  save(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      state.prefs[key] = value;
    } catch { /* storage full ou bloqueado */ }
  },

  saveAll(prefs) {
    try {
      for (const [key, value] of Object.entries(prefs)) {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      }
      Object.assign(state.prefs, prefs);
    } catch { /* noop */ }
  },

  reset() {
    try {
      for (const key of Object.keys(DEFAULT_PREFS)) {
        localStorage.removeItem(LS_PREFIX + key);
      }
      state.prefs = { ...DEFAULT_PREFS };
    } catch { /* noop */ }
  },
};

// ═══════════════════════════════════════════════════════════════
// DATES — Helpers de data
// ═══════════════════════════════════════════════════════════════

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date) {
  const q = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), q, 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function weekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ═══════════════════════════════════════════════════════════════
// CARD HELPERS
// ═══════════════════════════════════════════════════════════════

function getCardTimeline(card) {
  const officialStart = toDate(card.plannedStartDate || card.startDate);
  const fallbackStart = toDate(card.createdAt);
  const end = toDate(card.plannedEndDate || card.dueDate);

  if (!end) {
    return {
      card,
      start: officialStart || fallbackStart,
      end: null,
      canRender: false,
      startSource: officialStart ? 'jira' : 'missing',
      issue: 'missing_end',
    };
  }

  const start = officialStart || fallbackStart;
  if (!start) {
    return {
      card,
      start: null,
      end,
      canRender: false,
      startSource: 'missing',
      issue: 'missing_start',
    };
  }

  const isOverdue = isCardOverdue(card);
  return {
    card,
    start: start > end ? end : start,
    end,
    canRender: true,
    startSource: officialStart ? 'jira' : 'created_at_fallback',
    issue: officialStart ? null : 'fallback_start',
    isOverdue,
  };
}

function getStatusClass(item) {
  const card = item.card;
  const category = resolveStatusCategory(card.status || '');
  if (item.isOverdue) return 'overdue';
  if (category === StatusCategory.DONE) return 'done';
  if (category === StatusCategory.IN_PROGRESS) return 'progress';
  if (category === StatusCategory.BLOCKED) return 'overdue';
  const start = item.start;
  if (start && start > new Date()) return 'future';
  return 'todo';
}

function getBarColors(statusClass) {
  const map = {
    done: { bg: '#10b981', from: '#10b981', to: '#059669' },
    progress: { bg: '#3b82f6', from: '#3b82f6', to: '#2563eb' },
    overdue: { bg: '#ef4444', from: '#ef4444', to: '#dc2626' },
    future: { bg: '#8b5cf6', from: '#8b5cf6', to: '#7c3aed' },
    todo: { bg: '#64748b', from: '#64748b', to: '#475569' },
    fallback: { bg: '#f59e0b', from: '#f59e0b', to: '#d97706' },
  };
  return map[statusClass] || map.todo;
}

// ═══════════════════════════════════════════════════════════════
// RANGE & TICKS — Cálculo da timeline
// ═══════════════════════════════════════════════════════════════

function getRange(items) {
  const renderable = items.filter(item => item.canRender && item.start && item.end);
  const now = new Date();
  let min = Infinity;
  let max = -Infinity;

  if (!renderable.length) {
    min = now.getTime();
    max = now.getTime();
  } else {
    for (const item of renderable) {
      if (item.start && item.start.getTime() < min) min = item.start.getTime();
      if (item.end && item.end.getTime() > max) max = item.end.getTime();
    }
  }

  // Aplicar navegação (navOffset)
  const offsetDays = state.navOffset || 0;
  let start = addDays(new Date(min), -5 + offsetDays);
  let end = addDays(new Date(max), 15 + offsetDays);

  // Garantir um período mínimo visível dependendo do zoom
  const viewMode = state.prefs.viewMode;
  let minSpan = 30;
  if (viewMode === 'week') minSpan = 90;
  if (viewMode === 'month') minSpan = 365;
  if (viewMode === 'quarter') minSpan = 730;

  if (daysBetween(start, end) < minSpan) {
    end = addDays(start, minSpan);
  }

  return { start, end };
}

function getTicks(range, viewMode) {
  const ticks = [];
  const maxTicks = viewMode === 'day' ? 365
    : viewMode === 'week' ? 104
    : viewMode === 'month' ? 48
    : 40; // quarter

  let cursor;
  let step;

  if (viewMode === 'day') {
    cursor = new Date(range.start);
    step = 1;
  } else if (viewMode === 'week') {
    cursor = startOfWeek(range.start);
    step = 7;
  } else if (viewMode === 'month') {
    cursor = startOfMonth(range.start);
    step = 0; // 1 mês
  } else { // quarter
    cursor = startOfQuarter(range.start);
    step = 0; // 3 meses
  }

  let iterations = 0;
  const safety = 500;

  while (cursor <= range.end && ticks.length < maxTicks && iterations < safety) {
    ticks.push(new Date(cursor));
    iterations++;

    if (viewMode === 'month') {
      cursor.setMonth(cursor.getMonth() + 1);
    } else if (viewMode === 'quarter') {
      cursor.setMonth(cursor.getMonth() + 3);
    } else {
      cursor = addDays(cursor, step);
    }
  }

  return ticks;
}

function getCellWidth(viewMode) {
  const base = state.prefs.timelineCellWidth;
  if (viewMode === 'day') return base;
  if (viewMode === 'week') return base * 1.8;
  if (viewMode === 'month') return base * 3.5;
  return base * 5; // quarter
}

function getTicksForMonth(monthStart, viewMode) {
  const ticks = [];
  const end = endOfMonth(monthStart);
  let cursor = new Date(monthStart);

  if (viewMode === 'day') {
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
  } else if (viewMode === 'week') {
    const endDate = new Date(end);
    // Mostrar semanas dentro do mês
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    cursor = startOfWeek(monthStart);
    while (cursor <= monthEnd && cursor <= addDays(endDate, 7)) {
      ticks.push(new Date(cursor));
      cursor = addDays(cursor, 7);
    }
  } else if (viewMode === 'month') {
    ticks.push(new Date(monthStart));
  } else {
    // quarter — apenas um tick por mês
    ticks.push(new Date(monthStart));
  }

  return ticks;
}

// ═══════════════════════════════════════════════════════════════
// FILTERS — Filtros e busca
// ═══════════════════════════════════════════════════════════════

function applyFilters(items) {
  const now = new Date();
  let result = items;

  if (state.projectId) {
    result = result.filter(item => item.card.projectId === state.projectId);
  }
  if (state.analystId) {
    result = result.filter(item => item.card.assigneeId === state.analystId);
  }
  if (state.status) {
    result = result.filter(item => item.card.status === state.status);
  }
  if (state.priority) {
    result = result.filter(item => item.card.priority === state.priority);
  }

  if (state.period === '30') {
    const limit = addDays(now, 30);
    result = result.filter(item =>
      item.canRender && item.start && item.start <= limit && item.end >= now
    );
  } else if (state.period === '90') {
    const limit = addDays(now, 90);
    result = result.filter(item =>
      item.canRender && item.start && item.start <= limit && item.end >= now
    );
  } else if (state.period === '180') {
    const limit = addDays(now, 180);
    result = result.filter(item =>
      item.canRender && item.start && item.start <= limit && item.end >= now
    );
  } else if (state.period === 'overdue') {
    result = result.filter(item => item.isOverdue);
  } else if (state.period === 'no_dates') {
    result = result.filter(item => !item.canRender || item.issue);
  }

  // Busca
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    result = result.filter(item => {
      const card = item.card;
      return card.key.toLowerCase().includes(q)
        || (card.title && card.title.toLowerCase().includes(q));
    });
  }

  return result;
}

function getActiveFilterCount() {
  let count = 0;
  if (state.projectId) count++;
  if (state.analystId) count++;
  if (state.status) count++;
  if (state.priority) count++;
  if (state.period !== 'all') count++;
  if (state.searchQuery) count++;
  return count;
}

// ═══════════════════════════════════════════════════════════════
// GROUPS — Agrupamento
// ═══════════════════════════════════════════════════════════════

const GROUP_ICONS = {
  project: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  assignee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-8 8-8s8 4 8 8"/></svg>`,
  status: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  priority: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l-4 8h8z"/><path d="M12 12v10"/></svg>`,
};

function getGroupKey(item, grouping) {
  const card = item.card;
  switch (grouping) {
    case 'project': return card.projectId;
    case 'assignee': return card.assigneeId || 'unassigned';
    case 'status': return resolveStatusCategory(card.status || '');
    case 'priority': return card.priority || 'none';
    default: return '_all';
  }
}

function getGroupLabel(key, grouping, projects, users) {
  if (grouping === 'project') {
    const p = projects.find(pr => pr.id === key);
    return p ? `${p.key} — ${p.name}` : key || 'Sem projeto';
  }
  if (grouping === 'assignee') {
    if (key === 'unassigned') return 'Não atribuído';
    const u = users.find(us => us.id === key);
    return u ? u.displayName : key || 'Desconhecido';
  }
  if (grouping === 'status') {
    const labels = { todo: 'A Fazer', in_progress: 'Em Andamento', done: 'Concluído', blocked: 'Bloqueado' };
    return labels[key] || key || 'Desconhecido';
  }
  if (grouping === 'priority') {
    const labels = { highest: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', lowest: 'Muito Baixa', none: 'Sem prioridade' };
    return labels[key] || key || 'Desconhecido';
  }
  return 'Todos os tickets';
}

function getGroupColor(key, grouping) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7', '#10b981'];
  // Hash simples para cor consistente
  let hash = 0;
  const str = key || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function groupItems(items, grouping) {
  const groups = {};

  for (const item of items) {
    const key = getGroupKey(item, grouping);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════════
// PIXEL POSITIONS — Cálculo de posição na timeline
// ═══════════════════════════════════════════════════════════════

function getPixelPosition(date, range, totalDays, totalPixels) {
  if (!date || !range.start) return 0;
  const dayOffset = (date - range.start) / DAY_MS;
  return Math.max(0, (dayOffset / totalDays) * totalPixels);
}

function getPixelWidth(start, end, range, totalDays, totalPixels) {
  if (!start || !end) return 60; // largura mínima
  const duration = daysBetween(start, end);
  const width = (duration / totalDays) * totalPixels;
  return Math.max(40, width); // largura mínima 40px
}

// ═══════════════════════════════════════════════════════════════
// RESIZE — Redimensionamento de colunas (drag & drop)
// ═══════════════════════════════════════════════════════════════

const ResizeManager = {
  active: false,
  startX: 0,
  startWidth: 0,
  type: null, // 'left' | 'cell' | 'col'
  targetCol: null,

  init() {
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  },

  onLeftMouseDown(event) {
    this.active = true;
    this.startX = event.clientX;
    this.startWidth = state.prefs.leftColWidth;
    this.type = 'left';
    document.body.classList.add('gantt-resize-active');
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
  },

  onCellMouseDown(event) {
    this.active = true;
    this.startX = event.clientX;
    this.startWidth = state.prefs.timelineCellWidth;
    this.type = 'cell';
    document.body.classList.add('gantt-resize-active');
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
  },

  onColMouseDown(event, colKey) {
    this.active = true;
    this.startX = event.clientX;
    this.startWidth = state.prefs.colWidths[colKey] || 100;
    this.type = 'col';
    this.targetCol = colKey;
    document.body.classList.add('gantt-resize-active');
    document.body.style.cursor = 'col-resize';
    event.preventDefault();
    event.stopPropagation();
  },

  onMouseMove(event) {
    if (!this.active) return;
    const diff = event.clientX - this.startX;

    if (this.type === 'left') {
      const newWidth = Math.max(200, Math.min(1200, this.startWidth + diff));
      state.prefs.leftColWidth = newWidth;
      document.documentElement.style.setProperty('--gantt-left-col-width', `${newWidth}px`);
    } else if (this.type === 'cell') {
      const newWidth = Math.max(20, Math.min(300, this.startWidth + diff / 2));
      state.prefs.timelineCellWidth = newWidth;
      document.documentElement.style.setProperty('--gantt-cell-width', `${newWidth}px`);
      this._refreshTimelineWidth();
    } else if (this.type === 'col') {
      const newWidth = Math.max(40, Math.min(800, this.startWidth + diff));
      state.prefs.colWidths[this.targetCol] = newWidth;
      this._refreshColWidth(this.targetCol, newWidth);
    }
  },

  onMouseUp() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('gantt-resize-active');
    document.body.style.cursor = '';

    if (this.type === 'left') {
      Preferences.save('leftColWidth', state.prefs.leftColWidth);
    } else if (this.type === 'cell') {
      Preferences.save('timelineCellWidth', state.prefs.timelineCellWidth);
    } else if (this.type === 'col') {
      Preferences.save('colWidths', state.prefs.colWidths);
    }

    this.type = null;
    this.targetCol = null;
  },

  _refreshTimelineWidth() {
    const ticks = document.querySelectorAll('.gantt-timeline-tick');
    const lines = document.querySelectorAll('.gantt-grid-line');
    const cellW = state.prefs.timelineCellWidth;
    ticks.forEach(el => el.style.minWidth = `${cellW}px`);
    lines.forEach(el => el.style.minWidth = `${cellW}px`);
  },

  _refreshColWidth(colKey, width) {
    const header = document.querySelector(`.gantt-col-header[data-col="${colKey}"]`);
    if (header) header.style.width = `${width}px`;
    
    const cells = document.querySelectorAll(`.gantt-row-cell[data-col="${colKey}"]`);
    cells.forEach(c => c.style.width = `${width}px`);

    this._recalculateTotalLeftWidth();
  },

  _recalculateTotalLeftWidth() {
    const visibleCols = state.prefs.visibleCols;
    const total = visibleCols.reduce((acc, col) => acc + (state.prefs.colWidths[col] || 100), 0);
    state.prefs.leftColWidth = total;
    document.documentElement.style.setProperty('--gantt-left-col-width', `${state.prefs.leftColWidth}px`);
    Preferences.save('leftColWidth', state.prefs.leftColWidth);
  }
};

// ═══════════════════════════════════════════════════════════════
// MODAL — Tooltip / Modal detalhado
// ═══════════════════════════════════════════════════════════════

function openModal(cardId) {
  const card = dataService.getCardById(cardId);
  if (!card) return;

  const project = dataService.getProjectById(card.projectId);
  const user = dataService.getUserById(card.assigneeId);
  const timeline = getCardTimeline(card);

  const duration = timeline.start && timeline.end
    ? daysBetween(timeline.start, timeline.end) + ' dias'
    : '—';

  const overdueLabel = timeline.isOverdue
    ? '<span class="gantt-modal-grid-value danger">Atrasado</span>'
    : '<span class="gantt-modal-grid-value success">No prazo</span>';

  const fallbackWarning = timeline.startSource === 'created_at_fallback'
    ? `
      <div class="gantt-modal-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="gantt-modal-warning-text">Data de início usa fallback da criação do Jira por falta de data planejada.</span>
      </div>`
    : '';

  const createdDate = card.createdAt ? formatDate(card.createdAt) : '—';
  const updatedDate = card.updatedAt ? formatDate(card.updatedAt) : '—';

  const backdrop = document.createElement('div');
  backdrop.className = 'gantt-modal-backdrop';
  backdrop.innerHTML = `
    <div class="gantt-modal" role="dialog" aria-modal="true">
      <div class="gantt-modal-header">
        <div class="gantt-modal-header-info">
          <div class="gantt-modal-key">
            <span>${sanitize(card.key)}</span>
            <span class="gantt-row-badge priority-${sanitize(card.priority || 'medium')}">${sanitize(priorityLabel(card.priority))}</span>
            ${timeline.isOverdue ? '<span class="gantt-row-badge overdue">Atrasado</span>' : ''}
          </div>
          <div class="gantt-modal-title">${sanitize(card.title)}</div>
        </div>
        <button class="gantt-modal-close" aria-label="Fechar" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">&times;</button>
      </div>
      <div class="gantt-modal-body">
        ${fallbackWarning}
        <div class="gantt-modal-grid">
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Projeto</span>
            <span class="gantt-modal-grid-value">${sanitize(project?.name || project?.key || card.projectId || '-')}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Responsável</span>
            <span class="gantt-modal-grid-value">${sanitize(user?.displayName || 'Não atribuído')}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Status</span>
            <span class="gantt-modal-grid-value">${sanitize(card.status || '-')}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Prioridade</span>
            <span class="gantt-modal-grid-value">${sanitize(priorityLabel(card.priority))}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Data de início</span>
            <span class="gantt-modal-grid-value">${sanitize(timeline.start ? formatDate(timeline.start) : 'Sem data')}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Data prevista (fim)</span>
            <span class="gantt-modal-grid-value ${timeline.isOverdue ? 'danger' : ''}">${sanitize(timeline.end ? formatDate(timeline.end) : 'Sem previsão')}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Criação Jira</span>
            <span class="gantt-modal-grid-value">${sanitize(createdDate)}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Atualização Jira</span>
            <span class="gantt-modal-grid-value">${sanitize(updatedDate)}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Duração</span>
            <span class="gantt-modal-grid-value">${sanitize(duration)}</span>
          </div>
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Situação</span>
            ${overdueLabel}
          </div>
          ${card.type ? `
          <div class="gantt-modal-grid-item">
            <span class="gantt-modal-grid-label">Tipo</span>
            <span class="gantt-modal-grid-value">${sanitize(card.type)}</span>
          </div>` : ''}
          ${timeline.startSource === 'created_at_fallback' ? `
          <div class="gantt-modal-grid-item full">
            <span class="gantt-modal-grid-label warning">Fonte da data</span>
            <span class="gantt-modal-grid-value">Data de criação do Jira usada como início (fallback).</span>
          </div>` : ''}
        </div>
      </div>
      <div class="gantt-modal-footer">
        <div class="gantt-modal-meta">
          <span>${sanitize(project?.key || '')}</span>
          ${card.assigneeId ? `<span>— ${sanitize(user?.displayName || '')}</span>` : ''}
        </div>
        <div class="gantt-modal-actions">
          ${card.jiraUrl ? `<a class="btn btn-primary btn-sm" href="${sanitize(card.jiraUrl)}" target="_blank" rel="noopener noreferrer">Abrir no Jira</a>` : ''}
          <button class="btn btn-secondary btn-sm gantt-modal-close-btn">Fechar</button>
        </div>
      </div>
    </div>
  `;

  // Eventos de fechamento
  backdrop.querySelector('.gantt-modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('.gantt-modal-close-btn')?.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop || event.target.closest('.gantt-modal-close')) backdrop.remove();
  });
  document.addEventListener('keydown', function onEscape(e) {
    if (e.key === 'Escape' && document.contains(backdrop)) {
      backdrop.remove();
      document.removeEventListener('keydown', onEscape);
    }
  });

  document.body.appendChild(backdrop);
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS — Painel de personalização
// ═══════════════════════════════════════════════════════════════

function openSettingsPanel() {
  if (document.querySelector('.gantt-settings-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'gantt-settings-overlay';

  const panel = document.createElement('div');
  panel.className = 'gantt-settings-panel';
  panel.innerHTML = `
    <div class="gantt-settings-header">
      <h3>Personalizar Visualização</h3>
      <button class="gantt-settings-close" aria-label="Fechar painel">&times;</button>
    </div>
    <div class="gantt-settings-body">
      <div class="gantt-settings-section">
        <div class="gantt-settings-section-title">Colunas da Tabela</div>
        <div class="gantt-settings-columns-grid">
          ${Object.entries(COLUMN_METADATA).map(([id, meta]) => {
            const isVisible = state.prefs.visibleCols.includes(id);
            return `
              <div class="gantt-settings-option">
                <div class="gantt-settings-option-info">
                  <div class="gantt-settings-option-label">${meta.label}</div>
                </div>
                <label class="gantt-toggle">
                  <input type="checkbox" data-col-id="${id}" ${isVisible ? 'checked' : ''} ${id === 'key' ? 'disabled' : ''}>
                  <span class="gantt-toggle-slider"></span>
                </label>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div class="gantt-settings-section">
        <div class="gantt-settings-section-title">Dados</div>
        <div class="gantt-settings-option">
          <div>
            <div class="gantt-settings-option-label">Tickets sem data</div>
            <div class="gantt-settings-option-desc">Mostrar tickets que não têm datas suficientes</div>
          </div>
          <label class="gantt-toggle">
            <input type="checkbox" data-pref="showNoDateTickets" ${state.prefs.showNoDateTickets ? 'checked' : ''}>
            <span class="gantt-toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="gantt-settings-section">
        <div class="gantt-settings-section-title">Agrupamento</div>
        <div class="gantt-settings-option">
          <div>
            <div class="gantt-settings-option-label">Agrupar por</div>
          </div>
          <select class="gantt-settings-select" data-pref="grouping">
            <option value="none" ${state.prefs.grouping === 'none' ? 'selected' : ''}>Sem agrupamento</option>
            <option value="project" ${state.prefs.grouping === 'project' ? 'selected' : ''}>Projeto</option>
            <option value="assignee" ${state.prefs.grouping === 'assignee' ? 'selected' : ''}>Responsável</option>
            <option value="status" ${state.prefs.grouping === 'status' ? 'selected' : ''}>Status</option>
            <option value="priority" ${state.prefs.grouping === 'priority' ? 'selected' : ''}>Prioridade</option>
          </select>
        </div>
      </div>
    </div>
    <div class="gantt-settings-footer">
      <button class="gantt-settings-reset">Redefinir para padrão</button>
    </div>
  `;

  overlay.addEventListener('click', () => { overlay.remove(); panel.remove(); });
  panel.querySelector('.gantt-settings-close').addEventListener('click', () => { overlay.remove(); panel.remove(); });

  // Colunas (checkboxes específicos)
  panel.querySelectorAll('input[data-col-id]').forEach(input => {
    input.addEventListener('change', () => {
      const colId = input.dataset.colId;
      let visibleCols = [...state.prefs.visibleCols];
      
      if (input.checked) {
        if (!visibleCols.includes(colId)) visibleCols.push(colId);
      } else {
        visibleCols = visibleCols.filter(id => id !== colId);
      }
      
      // Garantir ordem (baseada no COLUMN_METADATA)
      const ordered = Object.keys(COLUMN_METADATA).filter(id => visibleCols.includes(id));
      
      Preferences.save('visibleCols', ordered);
      ResizeManager._recalculateTotalLeftWidth();
      renderGantt();
    });
  });

  // Outras prefs
  panel.querySelectorAll('input[data-pref]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.pref;
      Preferences.save(key, input.checked);
      renderGantt();
    });
  });

  // Grouping select
  panel.querySelector('select[data-pref="grouping"]').addEventListener('change', e => {
    Preferences.save('grouping', e.target.value);
    renderGantt();
  });

  // Reset
  panel.querySelector('.gantt-settings-reset').addEventListener('click', () => {
    Preferences.reset();
    applyPrefs();
    overlay.remove();
    panel.remove();
    renderGantt();
  });

  // Escape
  document.addEventListener('keydown', function onEscape(e) {
    if (e.key === 'Escape' && document.contains(panel)) {
      overlay.remove();
      panel.remove();
      document.removeEventListener('keydown', onEscape);
    }
  });

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY — Cards de resumo
// ═══════════════════════════════════════════════════════════════

function renderSummary(filtered, allItems) {
  const overdue = allItems.filter(item => item.isOverdue);
  const renderable = allItems.filter(item => item.canRender);
  const noDate = allItems.filter(item => !item.canRender || item.issue);
  const fallback = allItems.filter(item => item.startSource === 'created_at_fallback');
  const done = allItems.filter(item => {
    const cat = resolveStatusCategory(item.card.status || '');
    return cat === StatusCategory.DONE;
  });
  const inProgress = allItems.filter(item => {
    const cat = resolveStatusCategory(item.card.status || '');
    return cat === StatusCategory.IN_PROGRESS;
  });

  return `
    <div class="gantt-summary-bar">
      <div class="gantt-summary-card">
        <div class="gantt-summary-icon filtered">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value">${filtered.length}</span>
          <span class="gantt-summary-label">Filtrados</span>
        </div>
      </div>
      <div class="gantt-summary-card">
        <div class="gantt-summary-icon total">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value">${allItems.length}</span>
          <span class="gantt-summary-label">Total</span>
        </div>
      </div>
      <div class="gantt-summary-card" title="Tickets atrasados">
        <div class="gantt-summary-icon overdue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value" style="color:${overdue.length ? '#ef4444' : 'inherit'}">${overdue.length}</span>
          <span class="gantt-summary-label">Atrasados</span>
        </div>
      </div>
      <div class="gantt-summary-card">
        <div class="gantt-summary-icon done">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value">${done.length}</span>
          <span class="gantt-summary-label">Concluídos</span>
        </div>
      </div>
      <div class="gantt-summary-card">
        <div class="gantt-summary-icon in-progress">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value">${inProgress.length}</span>
          <span class="gantt-summary-label">Em andamento</span>
        </div>
      </div>
      <div class="gantt-summary-card" title="Tickets sem data de início ou fim">
        <div class="gantt-summary-icon no-date">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value" style="color:${noDate.length ? '#f59e0b' : 'inherit'}">${noDate.length}</span>
          <span class="gantt-summary-label">Sem data</span>
        </div>
      </div>
      <div class="gantt-summary-card" title="Tickets com fallback de data de criação">
        <div class="gantt-summary-icon fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div class="gantt-summary-info">
          <span class="gantt-summary-value" style="color:${fallback.length ? '#a855f7' : 'inherit'}">${fallback.length}</span>
          <span class="gantt-summary-label">Fallback</span>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════════════════════════

function renderLegend() {
  return `
    <div class="gantt-legend">
      <span class="gantt-legend-title">Legenda</span>
      <div class="gantt-legend-items">
        <span class="gantt-legend-item"><span class="gantt-legend-color progress"></span>Em andamento</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color done"></span>Concluído</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color overdue"></span>Atrasado</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color future"></span>Futuro</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color todo"></span>A fazer</span>
        <span class="gantt-legend-item"><span class="gantt-legend-color fallback"></span>Fallback</span>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// NO-DATE SECTION
// ═══════════════════════════════════════════════════════════════

function renderNoDateSection(items, collapsed) {
  const noDateItems = items.filter(item => !item.canRender || item.issue);
  if (!noDateItems.length) return '';

  const missingStart = noDateItems.filter(i => i.issue === 'missing_start' || (i.issue === 'missing_end' && !i.start));
  const missingEnd = noDateItems.filter(i => i.issue === 'missing_end');
  const fallbackStart = noDateItems.filter(i => i.issue === 'fallback_start');

  // Agrupar por projeto para identificar problemas
  const projectMap = {};
  for (const item of noDateItems) {
    const pid = item.card.projectId;
    if (!projectMap[pid]) projectMap[pid] = { count: 0, issues: [] };
    projectMap[pid].count++;
    projectMap[pid].issues.push(item.issue);
  }
  const topProjects = Object.entries(projectMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const projects = dataService.getProjects();

  return `
    <div class="gantt-no-date-section">
      <div class="gantt-no-date-header">
        <div class="gantt-no-date-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <span class="gantt-no-date-title">Tickets com problemas de data</span>
        <span class="gantt-no-date-badge">${noDateItems.length}</span>
        <button class="gantt-no-date-toggle ${collapsed ? 'collapsed' : ''}" aria-label="${collapsed ? 'Expandir' : 'Recolher'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="gantt-no-date-body ${collapsed ? 'collapsed' : ''}">
        <div class="gantt-no-date-stats">
          <div class="gantt-no-date-stat">
            <div class="gantt-no-date-stat-value" style="color:#ef4444">${missingStart.length}</div>
            <div class="gantt-no-date-stat-label">Sem data de início</div>
          </div>
          <div class="gantt-no-date-stat">
            <div class="gantt-no-date-stat-value" style="color:#f59e0b">${missingEnd.length}</div>
            <div class="gantt-no-date-stat-label">Sem previsão de fim</div>
          </div>
          <div class="gantt-no-date-stat">
            <div class="gantt-no-date-stat-value" style="color:#8b5cf6">${fallbackStart.length}</div>
            <div class="gantt-no-date-stat-label">Fallback (criação)</div>
          </div>
          <div class="gantt-no-date-stat">
            <div class="gantt-no-date-stat-value">${topProjects.length}</div>
            <div class="gantt-no-date-stat-label">Projetos afetados</div>
          </div>
        </div>
        ${topProjects.length ? `
        <div style="padding: 0 20px 8px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Projetos com mais problemas</span>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
            ${topProjects.map(([pid, data]) => {
              const proj = projects.find(p => p.id === pid);
              return `<span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2);">${sanitize(proj?.key || pid)}: ${data.count}</span>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="gantt-no-date-list">
          ${noDateItems.slice(0, 50).map(item => {
            const issueLabel = item.issue === 'missing_start' ? 'Sem início' : item.issue === 'missing_end' ? 'Sem fim' : 'Fallback';
            const issueClass = item.issue === 'missing_start' ? 'missing-start' : item.issue === 'missing_end' ? 'missing-end' : 'fallback-start';
            return `
              <div class="gantt-no-date-item" data-card-id="${sanitize(item.card.id)}">
                <span class="gantt-no-date-item-key">${sanitize(item.card.key)}</span>
                <span class="gantt-no-date-item-title">${sanitize(item.card.title || '')}</span>
                <span class="gantt-no-date-item-issue ${issueClass}">${issueLabel}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE HEADER — Cabeçalho da timeline
// ═══════════════════════════════════════════════════════════════

function renderTimelineHeader(ticks, range, viewMode) {
  const cellW = getCellWidth(viewMode);

  // Determinar os meses únicos
  const months = [];
  const seen = new Set();
  for (const tick of ticks) {
    const key = `${tick.getFullYear()}-${tick.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push(tick);
    }
  }

  // Calcular spans para meses
  const monthHtml = months.map((monthStart, i) => {
    const monthEnd = i < months.length - 1
      ? months[i + 1]
      : addDays(ticks[ticks.length - 1], 1);
    const pixelStart = getPixelPosition(monthStart, range, daysBetween(range.start, range.end), 100);
    const pixelEnd = getPixelPosition(monthEnd, range, daysBetween(range.start, range.end), 100);
    const width = pixelEnd - pixelStart;

    const isCurrentMonth = monthStart.getMonth() === new Date().getMonth()
      && monthStart.getFullYear() === new Date().getFullYear();

    const label = viewMode === 'quarter'
      ? MONTH_NAMES_SHORT[monthStart.getMonth()] + ' ' + monthStart.getFullYear()
      : MONTH_NAMES[monthStart.getMonth()] + ' ' + monthStart.getFullYear();

    return `<div class="gantt-timeline-month ${isCurrentMonth ? 'today' : ''}" style="flex:${width.toFixed(4)};min-width:${cellW}px;">${sanitize(label)}</div>`;
  }).join('');

  // Ticks
  const tickHtml = ticks.map(tick => {
    const classes = ['gantt-timeline-tick'];
    if (viewMode === 'day' && isWeekend(tick)) classes.push('weekend');
    if (isSameDay(tick, new Date())) classes.push('today');

    let label;
    if (viewMode === 'day') {
      label = `${tick.getDate()}/${tick.getMonth() + 1}`;
    } else if (viewMode === 'week') {
      const end = addDays(tick, 6);
      label = `${tick.getDate()}/${tick.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`;
    } else if (viewMode === 'month') {
      label = MONTH_NAMES_SHORT[tick.getMonth()];
    } else {
      label = `T${Math.floor(tick.getMonth() / 3) + 1}/${tick.getFullYear()}`;
    }

    return `<div class="${classes.join(' ')}" style="min-width:${cellW}px;"><span class="gantt-timeline-tick-label">${sanitize(label)}</span></div>`;
  }).join('');

  return { monthHtml, tickHtml };
}

// ═══════════════════════════════════════════════════════════════
// BAR RENDER
// ═══════════════════════════════════════════════════════════════

function renderBar(item, range) {
  if (!item.canRender || !item.start || !item.end) return '';

  const totalDays = daysBetween(range.start, range.end);
  const totalPixels = totalDays * getCellWidth(state.prefs.viewMode);

  const left = getPixelPosition(item.start, range, totalDays, totalPixels);
  const width = getPixelWidth(item.start, item.end, range, totalDays, totalPixels);

  const cls = getStatusClass(item);
  const isFallback = item.startSource === 'created_at_fallback';
  const barClass = `gantt-bar ${cls}${isFallback ? ' fallback' : ''}`;

  return `
    <div class="${barClass}" style="left:${left}px;width:${Math.max(30, width)}px;" data-card-id="${sanitize(item.card.id)}" title="${sanitize(item.card.key)} — ${sanitize(item.card.title)}">
      <span class="gantt-bar-text">${sanitize(item.card.key)}</span>
      ${item.isOverdue ? '<span class="gantt-bar-overdue-indicator">!</span>' : ''}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// ROW RENDER (coluna esquerda)
// ═══════════════════════════════════════════════════════════════

function renderLeftRow(item) {
  const card = item.card;
  const project = dataService.getProjectById(card.projectId);
  const user = dataService.getUserById(card.assigneeId);
  const isOverdue = item.isOverdue;
  const statusCat = resolveStatusCategory(card.status || '');
  const timeline = item;

  const visibleCols = state.prefs.visibleCols || ['key', 'title', 'assignee', 'status', 'priority'];
  const colWidths = state.prefs.colWidths || DEFAULT_PREFS.colWidths;

  const cellsHtml = visibleCols.map(col => {
    let content = '';
    let cls = '';
    
    switch (col) {
      case 'key':
        content = `<a data-card-id="${sanitize(card.id)}">${sanitize(card.key)}</a>`;
        break;
      case 'title':
        content = `<span class="gantt-cell-text" title="${sanitize(card.title || '')}">${sanitize(card.title || '')}</span>`;
        break;
      case 'assignee':
        content = sanitize(user?.displayName || 'Não atribuído');
        break;
      case 'project':
        content = sanitize(project?.key || '');
        break;
      case 'status':
        content = `<span class="gantt-row-badge ${statusCat}">${sanitize(card.status || '')}</span>`;
        break;
      case 'priority':
        content = `<span class="gantt-row-badge priority-${sanitize(card.priority || 'medium')}">${sanitize(priorityLabel(card.priority))}</span>`;
        break;
      case 'startDate':
        content = timeline.start ? formatDate(timeline.start) : '—';
        if (timeline.startSource === 'created_at_fallback') cls = 'fallback';
        break;
      case 'endDate':
        content = timeline.end ? formatDate(timeline.end) : '—';
        if (isOverdue) cls = 'danger';
        break;
      case 'duration':
        content = timeline.start && timeline.end ? daysBetween(timeline.start, timeline.end) + 'd' : '—';
        break;
      case 'progress':
        const prog = statusCat === 'done' ? 100 : (statusCat === 'in_progress' ? 50 : 0);
        content = `<div class="gantt-progress-mini"><div class="gantt-progress-mini-bar" style="width:${prog}%"></div></div>`;
        break;
    }

    return `
      <div class="gantt-row-cell ${cls}" style="width:${colWidths[col] || 100}px" data-col="${col}">
        ${content}
      </div>
    `;
  }).join('');

  return `
    <div class="gantt-row" data-card-id="${sanitize(card.id)}">
      ${cellsHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// GROUP RENDER
// ═══════════════════════════════════════════════════════════════

function renderGroupHeader(key, groupItems, grouping, isCollapsed) {
  const projects = dataService.getProjects();
  const users = dataService.getUsers();
  const label = getGroupLabel(key, grouping, projects, users);
  const color = getGroupColor(key, grouping);
  const count = groupItems.length;
  const overdue = groupItems.filter(i => i.isOverdue).length;
  const noDates = groupItems.filter(i => !i.canRender).length;

  return `
    <div class="gantt-group-header" data-group-key="${sanitize(key)}" data-grouping="${sanitize(grouping)}">
      <button class="gantt-group-toggle ${isCollapsed ? 'collapsed' : ''}" aria-label="${isCollapsed ? 'Expandir' : 'Recolher'} grupo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="gantt-group-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;">
        ${grouping === 'assignee' || grouping === 'project' ? count : ''}
      </div>
      <span class="gantt-group-name">${sanitize(label)}</span>
      <div class="gantt-group-meta">
        <span class="gantt-group-count">${count}</span>
        ${overdue ? `<span class="gantt-group-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${overdue} atras.
        </span>` : ''}
        ${noDates ? `<span class="gantt-group-warning" style="color:#f59e0b;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${noDates} s/data
        </span>` : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// LEFT PANEL — Coluna fixa completa
// ═══════════════════════════════════════════════════════════════

function renderLeftPanel(items, grouping, collapsedGroups) {
  const grouped = groupItems(items, grouping);
  const keys = Object.keys(grouped);
  const visibleCols = state.prefs.visibleCols || ['key', 'title', 'assignee', 'status', 'priority'];
  const colWidths = state.prefs.colWidths || DEFAULT_PREFS.colWidths;

  const userSort = grouping === 'assignee'
    ? keys.sort((a, b) => {
        if (a === 'unassigned') return 1;
        if (b === 'unassigned') return -1;
        return a.localeCompare(b);
      })
    : keys.sort((a, b) => b.length - a.length);

  const headerColsHtml = visibleCols.map(col => `
    <div class="gantt-col-header" style="width:${colWidths[col] || 100}px" data-col="${col}">
      <span>${COLUMN_METADATA[col]?.label || col}</span>
      <div class="gantt-col-resize-handle" data-resize-col="${col}"></div>
    </div>
  `).join('');

  let bodyHtml = '';

  if (grouping === 'none') {
    const sorted = [...items].sort((a, b) => {
      if (a.start && b.start) return a.start - b.start;
      if (a.start) return -1;
      if (b.start) return 1;
      return a.card.key.localeCompare(b.card.key);
    });
    bodyHtml = sorted.map(item => renderLeftRow(item)).join('');
  } else {
    for (const key of userSort) {
      const groupItems = grouped[key].sort((a, b) => {
        if (a.start && b.start) return a.start - b.start;
        if (a.start) return -1;
        if (b.start) return 1;
        return a.card.key.localeCompare(b.card.key);
      });
      const isCollapsed = collapsedGroups[key] === true;

      bodyHtml += renderGroupHeader(key, groupItems, grouping, isCollapsed);
      bodyHtml += `<div class="gantt-group-rows ${isCollapsed ? 'collapsed' : ''}" data-group-key="${sanitize(key)}">`;
      bodyHtml += groupItems.map(item => renderLeftRow(item)).join('');
      bodyHtml += '</div>';
    }
  }

  return `
    <div class="gantt-left-panel">
      <div class="gantt-left-header-grid">
        ${headerColsHtml}
      </div>
      <div class="gantt-left-body">
        ${bodyHtml || '<div class="gantt-empty-state" style="padding: 40px 20px;"><h3>Nenhum ticket</h3><p>Tente ajustar os filtros ou alterar o período.</p></div>'}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// TIMELINE PANEL
// ═══════════════════════════════════════════════════════════════

function renderTimelinePanel(items, range, ticks, viewMode, grouping, collapsedGroups) {
  const totalDays = daysBetween(range.start, range.end);
  const totalPixels = totalDays * getCellWidth(viewMode);
  const today = new Date();

  // Cabeçalho da timeline
  const { monthHtml, tickHtml } = renderTimelineHeader(ticks, range, viewMode);

  // Grid de linhas (background)
  const gridLinesHtml = ticks.map(tick => {
    const classes = ['gantt-grid-line'];
    if (viewMode === 'day' && isWeekend(tick)) classes.push('weekend');
    if (isSameDay(tick, today)) classes.push('today');
    return `<div class="${classes.join(' ')}" style="min-width:${getCellWidth(viewMode)}px;"></div>`;
  }).join('');

  // Posição da linha "Hoje"
  const todayPixelPos = getPixelPosition(today, range, totalDays, totalPixels);

  // Barras
  const grouped = groupItems(items, grouping);
  const keys = Object.keys(grouped);
  const userSort = grouping === 'assignee'
    ? keys.sort((a, b) => {
        if (a === 'unassigned') return 1;
        if (b === 'unassigned') return -1;
        return a.localeCompare(b);
      })
    : keys.sort((a, b) => b.length - a.length);

  let bodyHtml = '';

  const renderRows = (groupItems) => {
    const sorted = [...groupItems].sort((a, b) => {
      if (a.start && b.start) return a.start - b.start;
      if (a.start) return -1;
      if (b.start) return 1;
      return a.card.key.localeCompare(b.card.key);
    });
    return sorted.map(item => `
      <div class="gantt-timeline-row">
        ${renderBar(item, range)}
      </div>
    `).join('');
  };

  if (grouping === 'none') {
    bodyHtml = renderRows(items);
  } else {
    for (const key of userSort) {
      const gi = grouped[key];
      const isCollapsed = collapsedGroups[key] === true;
      bodyHtml += `<div class="gantt-timeline-group">`;
      bodyHtml += isCollapsed
        ? `<div class="gantt-timeline-row" style="min-height:20px;"></div>`
        : renderRows(gi);
      bodyHtml += `</div>`;
    }
  }

  return `
    <div class="gantt-timeline-panel">
      <div class="gantt-timeline-scroll">
        <div class="gantt-timeline-content" style="width:${totalPixels}px;">
          <div class="gantt-timeline-header" style="width:${totalPixels}px;">
            <div class="gantt-timeline-months" style="width:${totalPixels}px;">
              ${monthHtml}
            </div>
            <div class="gantt-timeline-ticks" style="width:${totalPixels}px;">
              ${tickHtml}
            </div>
          </div>
          <div class="gantt-timeline-body" style="position:relative;width:${totalPixels}px;">
            <div class="gantt-grid-lines" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;">
              ${gridLinesHtml}
            </div>
            ${today >= range.start && today <= range.end ? `<div class="gantt-today-line" style="left:${todayPixelPos}px;"></div>` : ''}
            <div class="gantt-bars-container">
              ${bodyHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION — Navegação de período
// ═══════════════════════════════════════════════════════════════

function navigatePeriod(direction) {
  const range = state.currentRange;
  if (!range) return;

  const viewMode = state.prefs.viewMode;
  const span = daysBetween(range.start, range.end);
  const halfSpan = Math.max(Math.round(span * 0.5), 14);

  const shift = direction > 0 ? halfSpan : -halfSpan;
  state.navOffset = (state.navOffset || 0) + shift;
  renderGantt();
}

function resetToToday() {
  state.navOffset = 0;
  renderGantt();
}

// ═══════════════════════════════════════════════════════════════
// TOOLBAR — Filtros e controles
// ═══════════════════════════════════════════════════════════════

function renderToolbar(projects, users, allItems, filteredCount) {
  const allStatuses = [...new Set(allItems.map(i => i.card.status).filter(Boolean))].sort();
  const allPriorities = [...new Set(allItems.map(i => i.card.priority).filter(Boolean))].sort();
  const zoomOptions = [
    { value: 'day', label: 'Dia', icon: '' },
    { value: 'week', label: 'Semana', icon: '' },
    { value: 'month', label: 'Mês', icon: '' },
    { value: 'quarter', label: 'Trimestre', icon: '' },
  ];

  const activeFilterCount = getActiveFilterCount();
  const hiddenCount = allItems.length - filteredCount;

  return `
    <div class="gantt-toolbar">
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Projeto</span>
        <select id="gantt-project">
          <option value="">Todos</option>
          ${projects.map(p => `<option value="${sanitize(p.id)}" ${state.projectId === p.id ? 'selected' : ''}>${sanitize(p.key)}</option>`).join('')}
        </select>
      </div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Analista</span>
        <select id="gantt-analyst">
          <option value="">Todos</option>
          ${users.map(u => `<option value="${sanitize(u.id)}" ${state.analystId === u.id ? 'selected' : ''}>${sanitize(u.displayName)}</option>`).join('')}
        </select>
      </div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Status</span>
        <select id="gantt-status">
          <option value="">Todos</option>
          ${allStatuses.map(s => `<option value="${sanitize(s)}" ${state.status === s ? 'selected' : ''}>${sanitize(s)}</option>`).join('')}
        </select>
      </div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Prioridade</span>
        <select id="gantt-priority">
          <option value="">Todas</option>
          ${allPriorities.map(p => `<option value="${sanitize(p)}" ${state.priority === p ? 'selected' : ''}>${sanitize(priorityLabel(p))}</option>`).join('')}
        </select>
      </div>
      <div class="gantt-toolbar-divider"></div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Período</span>
        <select id="gantt-period">
          <option value="all" ${state.period === 'all' ? 'selected' : ''}>Todo período</option>
          <option value="30" ${state.period === '30' ? 'selected' : ''}>Próximos 30 dias</option>
          <option value="90" ${state.period === '90' ? 'selected' : ''}>Próximos 90 dias</option>
          <option value="180" ${state.period === '180' ? 'selected' : ''}>Próximos 180 dias</option>
          <option value="overdue" ${state.period === 'overdue' ? 'selected' : ''}>Atrasados</option>
          <option value="no_dates" ${state.period === 'no_dates' ? 'selected' : ''}>Sem datas</option>
        </select>
      </div>
      <div class="gantt-toolbar-divider"></div>
      <div class="gantt-toolbar-group" style="flex:1;min-width:140px;">
        <input type="search" id="gantt-search" placeholder="Buscar key ou título..." value="${sanitize(state.searchQuery)}" aria-label="Buscar ticket">
      </div>
      <div class="gantt-toolbar-divider"></div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Zoom</span>
        <div class="gantt-zoom-group">
          ${zoomOptions.map(z => `
            <button class="gantt-zoom-btn ${state.prefs.viewMode === z.value ? 'active' : ''}" data-view="${z.value}">${z.label}</button>
          `).join('')}
        </div>
      </div>
      <div class="gantt-toolbar-group">
        <span class="gantt-toolbar-label">Densidade</span>
        <div class="gantt-density-group">
          <button class="gantt-density-btn ${state.prefs.density === 'compact' ? 'active' : ''}" data-density="compact" title="Compacto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button class="gantt-density-btn ${state.prefs.density === 'normal' ? 'active' : ''}" data-density="normal" title="Confortável">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="5" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button class="gantt-density-btn ${state.prefs.density === 'expanded' ? 'active' : ''}" data-density="expanded" title="Expandido">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
          </button>
        </div>
      </div>
    </div>
    ${activeFilterCount > 0 ? `
      <div class="gantt-active-filters">
        <span class="gantt-active-filters-text">
          ${activeFilterCount} filtro(s) ativo(s) · ${filteredCount} ticket(s) exibido(s) ${hiddenCount ? `· ${hiddenCount} oculto(s)` : ''}
        </span>
        <button class="gantt-clear-all-btn" id="gantt-clear-filters">Limpar todos</button>
      </div>
    ` : ''}
  `;
}

// ═══════════════════════════════════════════════════════════════
// BIND EVENTS — Eventos dos controles
// ═══════════════════════════════════════════════════════════════

function bindEvents() {
  // Filtros
  document.getElementById('gantt-project')?.addEventListener('change', e => {
    state.projectId = e.target.value;
    renderGantt();
  });
  document.getElementById('gantt-analyst')?.addEventListener('change', e => {
    state.analystId = e.target.value;
    renderGantt();
  });
  document.getElementById('gantt-status')?.addEventListener('change', e => {
    state.status = e.target.value;
    renderGantt();
  });
  document.getElementById('gantt-priority')?.addEventListener('change', e => {
    state.priority = e.target.value;
    renderGantt();
  });
  document.getElementById('gantt-period')?.addEventListener('change', e => {
    state.period = e.target.value;
    renderGantt();
  });

  // Busca
  const searchInput = document.getElementById('gantt-search');
  if (searchInput) {
    const debouncedSearch = debounce(value => {
      state.searchQuery = value;
      renderGantt();
    }, 300);
    searchInput.addEventListener('input', e => debouncedSearch(e.target.value));
    searchInput.addEventListener('search', () => {
      state.searchQuery = '';
      renderGantt();
    });
  }

  // Clear filters
  document.getElementById('gantt-clear-filters')?.addEventListener('click', () => {
    state.projectId = '';
    state.analystId = '';
    state.status = '';
    state.priority = '';
    state.period = 'all';
    state.searchQuery = '';
    renderGantt();
  });

  // Zoom buttons
  document.querySelectorAll('.gantt-zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      Preferences.save('viewMode', view);
      state.prefs.viewMode = view;
      renderGantt();
    });
  });

  // Density buttons
  document.querySelectorAll('.gantt-density-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const density = btn.dataset.density;
      Preferences.save('density', density);
      state.prefs.density = density;
      applyDensityClass();
      renderGantt();
    });
  });

  // Today and Settings buttons (moved to header, handled in renderGantt)


  // Card clicks (delegado)
  document.querySelector('.gantt-left-body')?.addEventListener('click', e => {
    const keyEl = e.target.closest('.gantt-row-key a');
    if (keyEl) {
      const cardId = keyEl.dataset.cardId;
      if (cardId) openModal(cardId);
      return;
    }

    const row = e.target.closest('.gantt-row');
    if (row && row.dataset.cardId) {
      const cardId = row.dataset.cardId;
      // Pega o key a e clique se não for no key a
      if (!e.target.closest('a')) {
        openModal(cardId);
      }
    }
  });

  // Bar clicks (delegado)
  document.querySelector('.gantt-bars-container')?.addEventListener('click', e => {
    const bar = e.target.closest('.gantt-bar');
    if (bar && bar.dataset.cardId) {
      openModal(bar.dataset.cardId);
    }
  });

  // No-date item clicks
  document.querySelector('.gantt-no-date-list')?.addEventListener('click', e => {
    const item = e.target.closest('.gantt-no-date-item');
    if (item && item.dataset.cardId) {
      openModal(item.dataset.cardId);
    }
  });

  // Group toggle (delegado)
  document.querySelector('.gantt-left-body')?.addEventListener('click', e => {
    const toggle = e.target.closest('.gantt-group-toggle');
    if (toggle) {
      const header = toggle.closest('.gantt-group-header');
      const rowsContainer = header?.nextElementSibling;
      if (rowsContainer) {
        const isCollapsed = toggle.classList.toggle('collapsed');
        rowsContainer.classList.toggle('collapsed');

        // Salvar estado
        const groupKey = header.dataset.groupKey;
        if (groupKey) {
          const collapsed = { ...state.prefs.collapsedGroups };
          if (isCollapsed) collapsed[groupKey] = true;
          else delete collapsed[groupKey];
          Preferences.save('collapsedGroups', collapsed);
        }
      }
      return;
    }

    // Clique no header expande/recolhe
    const groupHeader = e.target.closest('.gantt-group-header');
    if (groupHeader && !e.target.closest('.gantt-group-toggle')) {
      const toggle = groupHeader.querySelector('.gantt-group-toggle');
      if (toggle) toggle.click();
    }
  });

  // No-date section toggle
  const noDateToggle = document.querySelector('.gantt-no-date-toggle');
  if (noDateToggle) {
    noDateToggle.addEventListener('click', () => {
      const isCollapsed = noDateToggle.classList.toggle('collapsed');
      const body = noDateToggle.closest('.gantt-no-date-section')?.querySelector('.gantt-no-date-body');
      if (body) body.classList.toggle('collapsed');
      Preferences.save('noDateSectionCollapsed', isCollapsed);
    });
  }

  // Resize handlers
  document.querySelector('.gantt-left-panel')?.addEventListener('mousedown', e => {
    const handle = e.target.closest('.gantt-col-resize-handle');
    if (handle) {
      ResizeManager.onColMouseDown(e, handle.dataset.resizeCol);
    }
  });

  // Timeline cell resize
  document.querySelector('.gantt-timeline-header')?.addEventListener('mousedown', e => {
    // Aqui poderíamos adicionar um handle específico para o zoom fino se desejado
  });

  // Sincronizar scroll vertical entre painéis
  syncScrollVertical();
}

// ═══════════════════════════════════════════════════════════════
// SCROLL SYNC — Sincroniza scroll vertical entre os painéis
// ═══════════════════════════════════════════════════════════════

function syncScrollVertical() {
  const leftBody = document.querySelector('.gantt-left-body');
  const rightScroll = document.querySelector('.gantt-timeline-scroll');

  if (leftBody && rightScroll) {
    leftBody.addEventListener('scroll', () => {
      if (!rightScroll._syncing) {
        rightScroll._syncing = true;
        rightScroll.scrollTop = leftBody.scrollTop;
        rightScroll._syncing = false;
      }
    });

    rightScroll.addEventListener('scroll', () => {
      if (!leftBody._syncing) {
        leftBody._syncing = true;
        leftBody.scrollTop = rightScroll.scrollTop;
        leftBody._syncing = false;
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// APPLY PREFS — Aplica preferências ao DOM
// ═══════════════════════════════════════════════════════════════

function applyPrefs() {
  // Carregar prefs
  state.prefs = Preferences.load();

  // Aplicar variáveis CSS
  document.documentElement.style.setProperty('--gantt-left-col-width', `${state.prefs.leftColWidth}px`);
  document.documentElement.style.setProperty('--gantt-cell-width', `${state.prefs.timelineCellWidth}px`);
  document.documentElement.style.setProperty('--gantt-row-height', `${state.prefs.rowHeight}px`);

  // Aplicar larguras de colunas individuais (se existirem)
  if (state.prefs.colWidths) {
    Object.entries(state.prefs.colWidths).forEach(([col, width]) => {
      // Essas variáveis podem ser usadas no CSS para as colunas do grid
      document.documentElement.style.setProperty(`--gantt-col-${col}-width`, `${width}px`);
    });
  }

  // Densidade
  applyDensityClass();
}

function applyDensityClass() {
  document.querySelectorAll('.gantt-density-compact, .gantt-density-normal, .gantt-density-expanded').forEach(el => {
    el.classList.remove('gantt-density-compact', 'gantt-density-normal', 'gantt-density-expanded');
  });
  const mainGrid = document.querySelector('.gantt-grid');
  if (mainGrid) {
    mainGrid.classList.remove('gantt-density-compact', 'gantt-density-normal', 'gantt-density-expanded');
    mainGrid.classList.add(`gantt-density-${state.prefs.density}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDER — Orquestração principal
// ═══════════════════════════════════════════════════════════════

export function renderGantt() {
  applyPrefs();

  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');

  if (!header || !content) return;

  // Carregar dados
  const projects = dataService.getProjects();
  const users = dataService.getUsers();
  const cards = dataService.getCards();

  // Processar timeline
  const allItems = cards.map(getCardTimeline);
  const filtered = applyFilters(allItems);
  const renderable = filtered.filter(item => item.canRender && item.start && item.end);
  const range = getRange(renderable);
  const ticks = getTicks(range, state.prefs.viewMode);

  // Armazenar no state
  state.allItems = allItems;
  state.filteredItems = filtered;
  state.currentRange = range;
  state.currentTicks = ticks;

  // Header
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
      <div>
        <h2>Gantt</h2>
        <div class="subtitle">Timeline corporativa dos tickets Jira · ${cards.length} tickets</div>
      </div>
      <div class="gantt-header-actions">
        <button class="gantt-action-btn" id="gantt-btn-today-header" title="Rolar para hoje">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Hoje
        </button>
        <button class="gantt-action-btn primary" id="gantt-btn-settings-header" title="Personalizar visualização">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Personalizar
        </button>
        <div class="gantt-header-divider"></div>
        <span class="last-sync">
          <span class="dot"></span>
          ${cards.length} tickets
        </span>
      </div>
    </div>
  `;

  // Header actions
  document.getElementById('gantt-btn-today-header')?.addEventListener('click', resetToToday);
  document.getElementById('gantt-btn-settings-header')?.addEventListener('click', openSettingsPanel);

  // Content
  content.innerHTML = `
    <div class="gantt-page">
      ${renderToolbar(projects, users, allItems, filtered.length)}
      ${renderSummary(filtered, allItems)}
      ${filtered.length > 0 ? `
        <div class="gantt-main">
          <div class="gantt-grid">
            ${renderLeftPanel(filtered, state.prefs.grouping, state.prefs.collapsedGroups)}
            ${renderTimelinePanel(filtered, range, ticks, state.prefs.viewMode, state.prefs.grouping, state.prefs.collapsedGroups)}
          </div>
        </div>
        ${renderLegend()}
        ${state.prefs.showNoDateTickets ? renderNoDateSection(allItems, state.prefs.noDateSectionCollapsed) : ''}
      ` : `
        <div class="gantt-main no-data">
          <div class="gantt-empty-state">
            <div class="gantt-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3>Nenhum ticket encontrado</h3>
            <p>Não há tickets que correspondam aos filtros atuais. Tente ajustar os filtros ou alterar o período de visualização.</p>
          </div>
        </div>
      `}
    </div>
  `;

  // Aplicar densidade no novo DOM
  applyDensityClass();

  // Bind events
  bindEvents();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

// Inicializar resize manager
ResizeManager.init();

// Carregar preferências na inicialização
const initialPrefs = Preferences.load();
Object.assign(state.prefs, initialPrefs);


console.log('[Gantt] Módulo Gantt profissional carregado.');
