/**
 * board.js — Página de Board Kanban por status
 * 
 * REFATORADO: Usa _cards via DataService (mesma fonte do dashboard).
 * Kanban com scroll horizontal, botões de navegação e indicadores visuais.
 */
import { dataService } from '../data/data-service.js';
import { resolveStatusCategory, StatusCategory } from '../data/models.js';
import { formatDate, priorityLabel, sanitize, sanitizeTitle } from '../utils/helpers.js';

let currentFilters = {
  projectId: '',
  analystId: '',
  priority: '',
  search: ''
};

/**
 * Ordem visual das colunas do Kanban (de "A Fazer" a "Concluído")
 */
const COLUMN_ORDER = [
  StatusCategory.TODO,
  StatusCategory.IN_PROGRESS,
  StatusCategory.BLOCKED,
  StatusCategory.DONE
];

const COLUMN_LABELS = {
  [StatusCategory.TODO]: 'A Fazer',
  [StatusCategory.IN_PROGRESS]: 'Em Andamento',
  [StatusCategory.BLOCKED]: 'Bloqueado',
  [StatusCategory.DONE]: 'Concluído'
};

export function renderBoard() {
  const header = document.getElementById('page-header');
  
  header.innerHTML = `
    <div>
      <h2>Board Kanban</h2>
      <div class="subtitle">Visualização por status com arrastar e soltar</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" id="btn-refresh-board">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        Atualizar
      </button>
    </div>
  `;

  renderBoardContent();

  document.getElementById('btn-refresh-board').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-board');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Atualizando...';
    
    try {
      await dataService.refreshFromJira();
      renderBoardContent();
    } catch (error) {
      alert('Erro ao atualizar: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Atualizar';
    }
  });
}

/**
 * Agrupa cards por status e aplica filtros.
 * Usa _cards do DataService (mesma fonte que dashboard/executive).
 */
function buildBoardColumns() {
  let cards = dataService.getCards();

  // Aplicar filtros
  if (currentFilters.projectId) {
    cards = cards.filter(c => {
      const project = dataService.getProjectById(c.projectId);
      return project?.key === currentFilters.projectId;
    });
  }
  if (currentFilters.analystId) {
    cards = cards.filter(c => c.assigneeId === currentFilters.analystId);
  }
  if (currentFilters.priority) {
    cards = cards.filter(c => c.priority === currentFilters.priority.toLowerCase());
  }
  if (currentFilters.search) {
    const q = currentFilters.search.toLowerCase();
    cards = cards.filter(c =>
      c.key.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    );
  }

  // Agrupar por status (usando resolveStatusCategory para consistência)
  const grouped = {};
  COLUMN_ORDER.forEach(cat => { grouped[cat] = []; });

  // Coletar também status detalhados para sub-agrupamento visual
  const detailedStatuses = {};

  cards.forEach(c => {
    const category = resolveStatusCategory(c.status);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(c);

    // Contar cada status detalhado
    if (!detailedStatuses[c.status]) detailedStatuses[c.status] = 0;
    detailedStatuses[c.status]++;
  });

  return COLUMN_ORDER.map(cat => ({
    category: cat,
    label: COLUMN_LABELS[cat],
    cards: grouped[cat],
    total: grouped[cat].length
  }));
}

function renderBoardContent() {
  const content = document.getElementById('page-content');
  const projects = dataService.getProjects();
  const users = dataService.getUsers();
  const columns = buildBoardColumns();

  content.innerHTML = `
    <div class="filter-bar">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Projeto</span>
        <select id="filter-board-project">
          <option value="">Todos os Projetos</option>
          ${projects.map(p => `<option value="${sanitize(p.key)}" ${currentFilters.projectId === p.key ? 'selected' : ''}>${sanitize(p.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Analista</span>
        <select id="filter-board-analyst">
          <option value="">Todos os Analistas</option>
          ${users.map(u => `<option value="${sanitize(u.id)}" ${currentFilters.analystId === u.id ? 'selected' : ''}>${sanitize(u.displayName)}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Prioridade</span>
        <select id="filter-board-priority">
          <option value="">Todas</option>
          <option value="highest" ${currentFilters.priority === 'highest' ? 'selected' : ''}>Crítica</option>
          <option value="high" ${currentFilters.priority === 'high' ? 'selected' : ''}>Alta</option>
          <option value="medium" ${currentFilters.priority === 'medium' ? 'selected' : ''}>Média</option>
          <option value="low" ${currentFilters.priority === 'low' ? 'selected' : ''}>Baixa</option>
          <option value="lowest" ${currentFilters.priority === 'lowest' ? 'selected' : ''}>Menor</option>
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
        <span class="filter-label">Busca</span>
        <input type="search" id="search-board" placeholder="Buscar por chave ou título..." value="${currentFilters.search}">
      </div>
    </div>

    <div class="kanban-wrapper">
      <button class="kanban-nav-btn kanban-nav-left" id="kanban-scroll-left" title="Rolar para esquerda" aria-label="Rolar para esquerda">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <div class="kanban-container" id="kanban-scroll-container">
        ${columns.length === 0 || columns.every(c => c.total === 0 && !currentFilters.projectId) ? `
          <div class="empty-state" style="grid-column: 1 / -1; padding: 60px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <h3>Nenhum dado disponível</h3>
            <p>Conecte ao Jira para visualizar o board</p>
          </div>
        ` : columns.map(col => `
          <div class="kanban-column">
            <div class="kanban-column-header">
              <span class="kanban-column-title">${sanitize(col.label)}</span>
              <span class="kanban-column-count">${col.total}</span>
            </div>
            <div class="kanban-column-content" data-status="${sanitize(col.category)}">
              ${col.cards.length === 0 ? `
                <div class="kanban-empty">Nenhum item</div>
              ` : col.cards.map(card => {
                const project = dataService.getProjectById(card.projectId);
                const user = dataService.getUserById(card.assigneeId);
                const isOverdue = card.dueDate && resolveStatusCategory(card.status) !== StatusCategory.DONE && new Date(card.dueDate) < new Date();

                return `
                  <div class="kanban-card ${card.isInconsistent ? 'kanban-card-error' : ''} ${isOverdue ? 'kanban-card-overdue' : ''}" draggable="true" data-id="${sanitize(card.id)}">
                    ${card.isInconsistent ? `
                      <div class="kanban-card-badge kanban-card-badge-error" title="Dados Inconsistentes">!</div>
                    ` : ''}
                    ${isOverdue ? `
                      <div class="kanban-card-badge kanban-card-badge-overdue" title="Atrasado">⏰</div>
                    ` : ''}
                    <div class="kanban-card-header">
                      <span class="kanban-card-key">${sanitize(card.key)}</span>
                      <span class="kanban-card-priority priority-${sanitize(card.priority)}">${sanitize(priorityLabel(card.priority))}</span>
                    </div>
                    <div class="kanban-card-title">${sanitize(card.title)}</div>
                    ${card.dueDate ? `<div class="kanban-card-due ${isOverdue ? 'overdue' : ''}">${formatDate(card.dueDate)}</div>` : ''}
                    <div class="kanban-card-footer">
                      <div class="kanban-card-project">
                        ${project?.avatarUrl ? `<img src="${sanitizeTitle(project.avatarUrl)}" class="project-avatar" onerror="this.style.display='none'">` : ''}
                        <span>${sanitize(project?.key || '?')}</span>
                      </div>
                      ${user && user.id !== 'unassigned' ? `
                        <div class="kanban-card-assignee">
                          ${user.avatarUrl ? `<img src="${sanitizeTitle(user.avatarUrl)}" class="avatar avatar-xs" title="${sanitizeTitle(user.displayName)}" onerror="this.style.display='none'">` : `<span class="avatar-initials" title="${sanitizeTitle(user.displayName)}">${user.displayName.charAt(0)}</span>`}
                        </div>
                      ` : `
                        <div class="kanban-card-assignee unassigned" title="Não atribuído">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        </div>
                      `}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <button class="kanban-nav-btn kanban-nav-right" id="kanban-scroll-right" title="Rolar para direita" aria-label="Rolar para direita">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `;

  // Event listeners
  document.getElementById('filter-board-project')?.addEventListener('change', (e) => {
    currentFilters.projectId = e.target.value;
    renderBoardContent();
  });
  document.getElementById('filter-board-analyst')?.addEventListener('change', (e) => {
    currentFilters.analystId = e.target.value;
    renderBoardContent();
  });
  document.getElementById('filter-board-priority')?.addEventListener('change', (e) => {
    currentFilters.priority = e.target.value;
    renderBoardContent();
  });
  document.getElementById('search-board')?.addEventListener('input', (e) => {
    currentFilters.search = e.target.value;
    renderBoardContent();
  });

  initKanbanNavigation();
  initDragAndDrop();
}

/**
 * Inicializa scroll horizontal com: botões, wheel, e indicadores visuais.
 */
function initKanbanNavigation() {
  const container = document.getElementById('kanban-scroll-container');
  const btnLeft = document.getElementById('kanban-scroll-left');
  const btnRight = document.getElementById('kanban-scroll-right');

  if (!container) return;

  const SCROLL_AMOUNT = 340; // largura de uma coluna + gap

  // Atualizar visibilidade dos botões e indicadores
  function updateNavState() {
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;

    if (btnLeft) btnLeft.style.opacity = scrollLeft > 10 ? '1' : '0';
    if (btnLeft) btnLeft.style.pointerEvents = scrollLeft > 10 ? 'auto' : 'none';
    if (btnRight) btnRight.style.opacity = scrollLeft < maxScroll - 10 ? '1' : '0';
    if (btnRight) btnRight.style.pointerEvents = scrollLeft < maxScroll - 10 ? 'auto' : 'none';

    // Atualizar gradientes CSS via classe
    container.classList.toggle('has-scroll-left', scrollLeft > 10);
    container.classList.toggle('has-scroll-right', scrollLeft < maxScroll - 10);
  }

  // Botões de navegação
  btnLeft?.addEventListener('click', () => {
    container.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
  });
  btnRight?.addEventListener('click', () => {
    container.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
  });

  // Scroll horizontal via mouse wheel (trackpad/mouse vertical → scroll horizontal)
  container.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      container.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  }, { passive: false });

  // Escutar scroll para atualizar navegação
  container.addEventListener('scroll', updateNavState);

  // Estado inicial
  requestAnimationFrame(updateNavState);
}

function initDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-column-content');
  
  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });
  
  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });
    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
    });
  });
}