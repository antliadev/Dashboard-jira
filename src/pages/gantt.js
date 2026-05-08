/**
 * gantt.js - Timeline dos cards Jira persistidos no Supabase.
 */
import { dataService } from '../data/data-service.js';
import { sanitize } from '../utils/helpers.js';
import { resolveStatusCategory, StatusCategory, isCardOverdue } from '../data/models.js';

const state = {
  projectId: '',
  analystId: '',
  status: '',
  priority: '',
  period: 'all',
  scale: 'week'
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

function formatDate(date) {
  if (!date) return 'Sem data';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getCardTimeline(card) {
  const officialStart = toDate(card.plannedStartDate || card.startDate);
  const fallbackStart = toDate(card.createdAt);
  const end = toDate(card.plannedEndDate || card.dueDate);

  if (!end) {
    return {
      card,
      start: officialStart,
      end: null,
      canRender: false,
      startSource: officialStart ? 'jira' : 'missing',
      issue: 'missing_end'
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
      issue: 'missing_start'
    };
  }

  return {
    card,
    start: start > end ? end : start,
    end,
    canRender: true,
    startSource: officialStart ? 'jira' : 'created_at_fallback',
    issue: officialStart ? null : 'fallback_start'
  };
}

function getStatusClass(card) {
  const category = resolveStatusCategory(card.status || '');
  if (category === StatusCategory.DONE) return 'done';
  if (isCardOverdue(card)) return 'overdue';
  if (category === StatusCategory.IN_PROGRESS) return 'progress';
  const start = toDate(card.plannedStartDate || card.startDate || card.createdAt);
  if (start && start > new Date()) return 'future';
  return 'todo';
}

function applyFilters(items) {
  const now = new Date();
  let result = items;

  if (state.projectId) result = result.filter(item => item.card.projectId === state.projectId);
  if (state.analystId) result = result.filter(item => item.card.assigneeId === state.analystId);
  if (state.status) result = result.filter(item => item.card.status === state.status);
  if (state.priority) result = result.filter(item => item.card.priority === state.priority);

  if (state.period === '30') {
    const limit = addDays(now, 30);
    result = result.filter(item => item.canRender && item.start <= limit && item.end >= now);
  } else if (state.period === '90') {
    const limit = addDays(now, 90);
    result = result.filter(item => item.canRender && item.start <= limit && item.end >= now);
  } else if (state.period === '180') {
    const limit = addDays(now, 180);
    result = result.filter(item => item.canRender && item.start <= limit && item.end >= now);
  } else if (state.period === 'overdue') {
    result = result.filter(item => isCardOverdue(item.card));
  } else if (state.period === 'no_dates') {
    result = result.filter(item => !item.canRender || item.issue);
  }

  return result;
}

function getRange(items) {
  const renderable = items.filter(item => item.canRender);
  if (!renderable.length) {
    const today = new Date();
    return { start: addDays(today, -7), end: addDays(today, 30) };
  }

  const min = new Date(Math.min(...renderable.map(item => item.start.getTime())));
  const max = new Date(Math.max(...renderable.map(item => item.end.getTime())));
  return { start: addDays(min, -3), end: addDays(max, 7) };
}

function getTicks(range) {
  const step = state.scale === 'day' ? 1 : state.scale === 'week' ? 7 : 30;
  const ticks = [];
  for (let cursor = new Date(range.start); cursor <= range.end; cursor = addDays(cursor, step)) {
    ticks.push(new Date(cursor));
    if (ticks.length > 80) break;
  }
  return ticks;
}

function renderBar(item, range) {
  const totalDays = daysBetween(range.start, range.end);
  const left = Math.max(0, ((item.start - range.start) / DAY_MS) / totalDays * 100);
  const width = Math.max(1.5, daysBetween(item.start, item.end) / totalDays * 100);
  const cls = getStatusClass(item.card);
  const fallback = item.startSource === 'created_at_fallback';

  return `
    <button
      class="gantt-bar ${cls} ${fallback ? 'fallback' : ''}"
      style="left:${left}%;width:${Math.min(width, 100 - left)}%;"
      data-card-id="${sanitize(item.card.id)}"
      title="${sanitize(item.card.key)} - ${sanitize(item.card.title)}"
    >
      <span>${sanitize(item.card.key)}</span>
    </button>
  `;
}

function renderModal(cardId) {
  const card = dataService.getCardById(cardId);
  if (!card) return;

  const project = dataService.getProjectById(card.projectId);
  const user = dataService.getUserById(card.assigneeId);
  const timeline = getCardTimeline(card);
  const modal = document.createElement('div');
  modal.className = 'gantt-modal-backdrop';
  modal.innerHTML = `
    <div class="gantt-modal" role="dialog" aria-modal="true">
      <button class="gantt-modal-close" aria-label="Fechar">x</button>
      <div class="gantt-modal-key">${sanitize(card.key)}</div>
      <h3>${sanitize(card.title)}</h3>
      <div class="gantt-modal-grid">
        <div><span>Projeto</span><strong>${sanitize(project?.name || card.projectId || '-')}</strong></div>
        <div><span>Responsavel</span><strong>${sanitize(user?.displayName || 'Nao atribuido')}</strong></div>
        <div><span>Status</span><strong>${sanitize(card.status || '-')}</strong></div>
        <div><span>Prioridade</span><strong>${sanitize(card.priority || '-')}</strong></div>
        <div><span>Inicio</span><strong>${sanitize(formatDate(timeline.start))}</strong></div>
        <div><span>Fim previsto</span><strong>${sanitize(formatDate(timeline.end))}</strong></div>
      </div>
      ${timeline.startSource === 'created_at_fallback' ? '<p class="gantt-warning">Inicio visual usa data de criacao do Jira por falta de campo planejado.</p>' : ''}
      ${card.jiraUrl ? `<a class="btn btn-primary" href="${sanitize(card.jiraUrl)}" target="_blank" rel="noopener noreferrer">Abrir no Jira</a>` : ''}
    </div>
  `;
  modal.querySelector('.gantt-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function renderFilters(projects, users, cards) {
  const statuses = [...new Set(cards.map(card => card.status).filter(Boolean))].sort();
  const priorities = [...new Set(cards.map(card => card.priority).filter(Boolean))].sort();

  return `
    <div class="gantt-controls">
      <select id="gantt-project"><option value="">Todos projetos</option>${projects.map(p => `<option value="${sanitize(p.id)}" ${state.projectId === p.id ? 'selected' : ''}>${sanitize(p.key)} - ${sanitize(p.name)}</option>`).join('')}</select>
      <select id="gantt-analyst"><option value="">Todos analistas</option>${users.map(u => `<option value="${sanitize(u.id)}" ${state.analystId === u.id ? 'selected' : ''}>${sanitize(u.displayName)}</option>`).join('')}</select>
      <select id="gantt-status"><option value="">Todos status</option>${statuses.map(s => `<option value="${sanitize(s)}" ${state.status === s ? 'selected' : ''}>${sanitize(s)}</option>`).join('')}</select>
      <select id="gantt-priority"><option value="">Todas prioridades</option>${priorities.map(p => `<option value="${sanitize(p)}" ${state.priority === p ? 'selected' : ''}>${sanitize(p)}</option>`).join('')}</select>
      <select id="gantt-period">
        <option value="all" ${state.period === 'all' ? 'selected' : ''}>Todo periodo</option>
        <option value="30" ${state.period === '30' ? 'selected' : ''}>30 dias</option>
        <option value="90" ${state.period === '90' ? 'selected' : ''}>90 dias</option>
        <option value="180" ${state.period === '180' ? 'selected' : ''}>180 dias</option>
        <option value="overdue" ${state.period === 'overdue' ? 'selected' : ''}>Atrasados</option>
        <option value="no_dates" ${state.period === 'no_dates' ? 'selected' : ''}>Sem datas</option>
      </select>
      <div class="gantt-scale" role="group" aria-label="Escala">
        <button class="${state.scale === 'day' ? 'active' : ''}" data-scale="day">Dia</button>
        <button class="${state.scale === 'week' ? 'active' : ''}" data-scale="week">Semana</button>
        <button class="${state.scale === 'month' ? 'active' : ''}" data-scale="month">Mes</button>
      </div>
    </div>
  `;
}

function renderTimeline(items) {
  const renderable = items.filter(item => item.canRender);
  const range = getRange(renderable);
  const ticks = getTicks(range);
  const visible = renderable
    .sort((a, b) => a.start - b.start || a.card.key.localeCompare(b.card.key))
    .slice(0, 250);

  if (!visible.length) {
    return `<div class="empty-state"><h3>Sem dados suficientes para Gantt</h3><p>Tickets precisam de fim previsto. Inicio pode vir do Jira ou da data de criacao como fallback identificado.</p></div>`;
  }

  return `
    <div class="gantt-chart">
      <div class="gantt-header-row">
        <div class="gantt-label-head">Ticket</div>
        <div class="gantt-ticks">${ticks.map(t => `<span>${sanitize(formatDate(t).slice(0, 5))}</span>`).join('')}</div>
      </div>
      ${visible.map(item => {
        const project = dataService.getProjectById(item.card.projectId);
        const user = dataService.getUserById(item.card.assigneeId);
        return `
          <div class="gantt-row">
            <div class="gantt-row-label">
              <strong>${sanitize(item.card.key)}</strong>
              <span>${sanitize(project?.key || '')} · ${sanitize(user?.displayName || 'Nao atribuido')}</span>
            </div>
            <div class="gantt-row-track">${renderBar(item, range)}</div>
          </div>
        `;
      }).join('')}
    </div>
    ${renderable.length > visible.length ? `<p class="gantt-limit">Mostrando 250 de ${renderable.length} tickets filtrados.</p>` : ''}
  `;
}

function addGanttStyles() {
  if (document.getElementById('gantt-styles')) return;
  const style = document.createElement('style');
  style.id = 'gantt-styles';
  style.textContent = `
    .gantt-page { display: grid; gap: 18px; }
    .gantt-controls { display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)) auto; gap: 10px; align-items: center; }
    .gantt-controls select { width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-primary); border-radius: 6px; padding: 10px 12px; }
    .gantt-scale { display: inline-flex; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 3px; }
    .gantt-scale button { border: 0; background: transparent; color: var(--text-secondary); padding: 8px 10px; border-radius: 4px; cursor: pointer; }
    .gantt-scale button.active { background: var(--accent); color: white; }
    .gantt-health { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; }
    .gantt-health div { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
    .gantt-health span { color: var(--text-muted); font-size: 12px; display: block; margin-bottom: 6px; }
    .gantt-health strong { color: var(--text-primary); font-size: 20px; }
    .gantt-chart { overflow: auto; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }
    .gantt-header-row, .gantt-row { display: grid; grid-template-columns: 250px minmax(720px, 1fr); min-width: 980px; }
    .gantt-label-head, .gantt-row-label { border-right: 1px solid var(--border); }
    .gantt-label-head { padding: 12px 14px; color: var(--text-muted); font-size: 12px; text-transform: uppercase; background: var(--bg-secondary); }
    .gantt-ticks { display: flex; justify-content: space-between; gap: 8px; padding: 12px 14px; color: var(--text-muted); font-size: 11px; background: var(--bg-secondary); }
    .gantt-row { border-top: 1px solid var(--border); min-height: 54px; }
    .gantt-row-label { padding: 10px 14px; overflow: hidden; }
    .gantt-row-label strong, .gantt-row-label span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gantt-row-label span { margin-top: 4px; color: var(--text-muted); font-size: 12px; }
    .gantt-row-track { position: relative; min-height: 54px; background: linear-gradient(90deg, transparent calc(100% - 1px), rgba(255,255,255,.06) 100%); }
    .gantt-bar { position: absolute; top: 14px; height: 26px; border: 0; border-radius: 5px; color: white; padding: 0 8px; text-align: left; cursor: pointer; overflow: hidden; }
    .gantt-bar span { white-space: nowrap; font-size: 12px; font-weight: 700; }
    .gantt-bar.done { background: #2f9e44; }
    .gantt-bar.progress { background: #2f80ed; }
    .gantt-bar.overdue { background: #d64545; }
    .gantt-bar.future { background: #8a63d2; }
    .gantt-bar.todo { background: #667085; }
    .gantt-bar.fallback { outline: 2px dashed rgba(255,255,255,.6); outline-offset: 2px; }
    .gantt-limit, .gantt-warning { color: var(--warning); font-size: 13px; }
    .gantt-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 1000; padding: 20px; }
    .gantt-modal { width: min(560px, 100%); background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 22px; position: relative; }
    .gantt-modal-close { position: absolute; top: 12px; right: 12px; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary); border-radius: 4px; width: 30px; height: 30px; cursor: pointer; }
    .gantt-modal-key { color: var(--accent); font-weight: 700; margin-bottom: 6px; }
    .gantt-modal h3 { margin: 0 36px 16px 0; color: var(--text-primary); font-size: 18px; }
    .gantt-modal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .gantt-modal-grid div { border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
    .gantt-modal-grid span { display: block; color: var(--text-muted); font-size: 11px; margin-bottom: 4px; text-transform: uppercase; }
    .gantt-modal-grid strong { color: var(--text-primary); font-size: 13px; overflow-wrap: anywhere; }
    @media (max-width: 900px) {
      .gantt-controls, .gantt-health { grid-template-columns: 1fr; }
      .gantt-header-row, .gantt-row { grid-template-columns: 190px minmax(620px, 1fr); }
    }
  `;
  document.head.appendChild(style);
}

function bindEvents() {
  document.getElementById('gantt-project')?.addEventListener('change', event => { state.projectId = event.target.value; renderGantt(); });
  document.getElementById('gantt-analyst')?.addEventListener('change', event => { state.analystId = event.target.value; renderGantt(); });
  document.getElementById('gantt-status')?.addEventListener('change', event => { state.status = event.target.value; renderGantt(); });
  document.getElementById('gantt-priority')?.addEventListener('change', event => { state.priority = event.target.value; renderGantt(); });
  document.getElementById('gantt-period')?.addEventListener('change', event => { state.period = event.target.value; renderGantt(); });
  document.querySelectorAll('.gantt-scale button').forEach(button => {
    button.addEventListener('click', () => {
      state.scale = button.dataset.scale;
      renderGantt();
    });
  });
  document.querySelectorAll('.gantt-bar').forEach(button => {
    button.addEventListener('click', () => renderModal(button.dataset.cardId));
  });
}

export function renderGantt() {
  addGanttStyles();
  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');
  const projects = dataService.getProjects();
  const users = dataService.getUsers();
  const cards = dataService.getCards();
  const timelineItems = cards.map(getCardTimeline);
  const filtered = applyFilters(timelineItems);
  const missingStart = timelineItems.filter(item => item.startSource !== 'jira').length;
  const missingEnd = timelineItems.filter(item => !item.end).length;
  const fallbackStart = timelineItems.filter(item => item.startSource === 'created_at_fallback').length;
  const overdue = cards.filter(isCardOverdue).length;
  const done = cards.filter(card => resolveStatusCategory(card.status || '') === StatusCategory.DONE).length;

  header.innerHTML = `
    <div>
      <h2>Gantt</h2>
      <div class="subtitle">Timeline dos tickets persistidos no Supabase</div>
    </div>
  `;

  content.innerHTML = `
    <div class="gantt-page">
      ${renderFilters(projects, users, cards)}
      <div class="gantt-health">
        <div><span>Filtrados</span><strong>${filtered.length}</strong></div>
        <div><span>Atrasados</span><strong>${overdue}</strong></div>
        <div><span>Concluidos</span><strong>${done}</strong></div>
        <div><span>Sem inicio Jira</span><strong>${missingStart}</strong></div>
        <div><span>Sem fim previsto</span><strong>${missingEnd}</strong></div>
      </div>
      ${fallbackStart ? `<p class="gantt-warning">${fallbackStart} tickets usam data de criacao como inicio visual por falta de campo planejado.</p>` : ''}
      ${renderTimeline(filtered)}
    </div>
  `;

  bindEvents();
}
