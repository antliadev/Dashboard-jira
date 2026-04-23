/**
 * cards.js — Página de listagem de issues / cards
 */
import { dataService } from '../data/data-service.js';
import { formatDate, priorityLabel, typeLabel, debounce } from '../utils/helpers.js';
import { resolveStatusCategory } from '../data/models.js';

let currentFilters = {
  projectId: '',
  status: '',
  priority: '',
  search: '',
  sortBy: 'key',
  sortDir: 'asc'
};

export function renderCards() {
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Cards / Issues</h2>
      <div class="subtitle">Visão operacional de todas as tarefas</div>
    </div>
  `;

  renderCardsContent();
}

function renderCardsContent() {
  const content = document.getElementById('page-content');
  const projects = dataService.getProjects();
  const cards = dataService.getCards(currentFilters);
  
  content.innerHTML = `
    <div class="filter-bar">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Projeto</span>
        <select id="filter-project">
          <option value="">Todos os Projetos</option>
          ${projects.map(p => `<option value="${p.id}" ${currentFilters.projectId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Status</span>
        <select id="filter-status">
          <option value="">Todos os Status</option>
          ${[...new Set(dataService.getCards().map(c => c.status))].sort().map(s => `<option value="${s}" ${currentFilters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Prioridade</span>
        <select id="filter-priority">
          <option value="">Todas</option>
          <option value="highest" ${currentFilters.priority === 'highest' ? 'selected' : ''}>Crítica</option>
          <option value="high" ${currentFilters.priority === 'high' ? 'selected' : ''}>Alta</option>
          <option value="medium" ${currentFilters.priority === 'medium' ? 'selected' : ''}>Média</option>
          <option value="low" ${currentFilters.priority === 'low' ? 'selected' : ''}>Baixa</option>
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
        <span class="filter-label">Busca</span>
        <input type="search" id="search-cards" placeholder="Buscar por chave, título ou tag..." value="${currentFilters.search}">
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th onclick="window.sortCards('key')">Chave</th>
            <th onclick="window.sortCards('title')">Título</th>
            <th>Projeto</th>
            <th>Responsável</th>
            <th onclick="window.sortCards('status')">Status</th>
            <th onclick="window.sortCards('priority')">Prioridade</th>
            <th>Prazo</th>
          </tr>
        </thead>
        <tbody>
          ${cards.length === 0 ? `
            <tr>
              <td colspan="7" class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <h3>Nenhum card encontrado</h3>
                <p>Tente ajustar os filtros ou o termo de busca.</p>
              </td>
            </tr>
          ` : cards.map(c => {
            const project = dataService.getProjectById(c.projectId);
            const user = dataService.getUserById(c.assigneeId);
            const statusCat = resolveStatusCategory(c.status);
            return `
              <tr>
                <td style="font-weight: 700; color: var(--accent);">${c.key}</td>
                <td>
                  <div style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.title}">${c.title}</div>
                  <div style="display: flex; gap: 4px; margin-top: 4px;">
                    <span class="badge badge-type">${typeLabel(c.type)}</span>
                    ${(c.labels || []).slice(0, 2).map(l => `<span style="font-size: 10px; color: var(--text-muted);">#${l}</span>`).join('')}
                  </div>
                </td>
                <td>
                  <div style="font-weight: 500;">${project ? project.name : '—'}</div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${user ? user.avatarUrl : ''}" class="avatar avatar-sm">
                    <span>${user ? user.displayName : 'Não atribuído'}</span>
                  </div>
                </td>
                <td>
                  <span class="badge badge-${statusCat}">${c.status}</span>
                </td>
                <td>
                  <span class="badge badge-priority-${c.priority}">${priorityLabel(c.priority)}</span>
                </td>
                <td>
                  <span class="${new Date(c.dueDate) < new Date() && statusCat !== 'done' ? 'badge badge-overdue' : ''}">
                    ${formatDate(c.dueDate)}
                  </span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Event Listeners
  document.getElementById('filter-project').addEventListener('change', (e) => {
    currentFilters.projectId = e.target.value;
    renderCardsContent();
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    currentFilters.status = e.target.value;
    renderCardsContent();
  });
  document.getElementById('filter-priority').addEventListener('change', (e) => {
    currentFilters.priority = e.target.value;
    renderCardsContent();
  });
  
  const searchInput = document.getElementById('search-cards');
  searchInput.addEventListener('input', debounce((e) => {
    currentFilters.search = e.target.value;
    renderCardsContent();
  }, 300));

  // Função global para sort (chamada no inline onclick)
  window.sortCards = (field) => {
    if (currentFilters.sortBy === field) {
      currentFilters.sortDir = currentFilters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentFilters.sortBy = field;
      currentFilters.sortDir = 'asc';
    }
    renderCardsContent();
  };
}
