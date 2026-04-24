/**
 * board.js — Página de Board Kanban por status
 */
import { dataService } from '../data/data-service.js';
import { formatDate, priorityLabel } from '../utils/helpers.js';

let currentFilters = {
  projectId: '',
  analystId: '',
  priority: '',
  search: ''
};

export function renderBoard() {
  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');
  
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

function renderBoardContent() {
  const content = document.getElementById('page-content');
  const projects = dataService.getProjects();
  const users = dataService.getUsers();
  const boardData = dataService.getBoardData();
  
  let columns = boardData.columns || [];
  
  // Aplicar filtros
  if (currentFilters.projectId) {
    columns = columns.map(col => ({
      ...col,
      issues: col.issues.filter(i => i.project.key === currentFilters.projectId)
    }));
  }
  
  if (currentFilters.analystId) {
    columns = columns.map(col => ({
      ...col,
      issues: col.issues.filter(i => i.assignee?.id === currentFilters.analystId)
    }));
  }
  
  if (currentFilters.priority) {
    columns = columns.map(col => ({
      ...col,
      issues: col.issues.filter(i => i.priority?.name?.toLowerCase() === currentFilters.priority.toLowerCase())
    }));
  }
  
  if (currentFilters.search) {
    const q = currentFilters.search.toLowerCase();
    columns = columns.map(col => ({
      ...col,
      issues: col.issues.filter(i => 
        i.key.toLowerCase().includes(q) || 
        i.title.toLowerCase().includes(q)
      )
    }));
  }

  content.innerHTML = `
    <div class="filter-bar">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Projeto</span>
        <select id="filter-board-project">
          <option value="">Todos os Projetos</option>
          ${projects.map(p => `<option value="${p.key}" ${currentFilters.projectId === p.key ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Analista</span>
        <select id="filter-board-analyst">
          <option value="">Todos os Analistas</option>
          ${users.map(u => `<option value="${u.id}" ${currentFilters.analystId === u.id ? 'selected' : ''}>${u.displayName}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span class="filter-label">Prioridade</span>
        <select id="filter-board-priority">
          <option value="">Todas</option>
          <option value="Highest" ${currentFilters.priority === 'Highest' ? 'selected' : ''}>Crítica</option>
          <option value="High" ${currentFilters.priority === 'High' ? 'selected' : ''}>Alta</option>
          <option value="Medium" ${currentFilters.priority === 'Medium' ? 'selected' : ''}>Média</option>
          <option value="Low" ${currentFilters.priority === 'Low' ? 'selected' : ''}>Baixa</option>
        </select>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
        <span class="filter-label">Busca</span>
        <input type="search" id="search-board" placeholder="Buscar por chave ou título..." value="${currentFilters.search}">
      </div>
    </div>

    <div class="kanban-container">
      ${columns.length === 0 ? `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 60px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <h3>Nenhum dado disponível</h3>
          <p>Conecte ao Jira para visualizar o board</p>
        </div>
      ` : columns.map(col => `
        <div class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-column-title">${col.name}</span>
            <span class="kanban-column-count">${col.total}</span>
          </div>
          <div class="kanban-column-content" data-status="${col.name}">
            ${col.issues.length === 0 ? `
              <div class="kanban-empty">Nenhum item</div>
            ` : col.issues.map(issue => `
              <div class="kanban-card" draggable="true" data-id="${issue.id}">
                <div class="kanban-card-header">
                  <span class="kanban-card-key">${issue.key}</span>
                  ${issue.priority ? `<span class="kanban-card-priority priority-${issue.priority.name.toLowerCase()}">${issue.priority.name}</span>` : ''}
                </div>
                <div class="kanban-card-title">${issue.title}</div>
                <div class="kanban-card-footer">
                  <div class="kanban-card-project">
                    ${issue.project.avatar ? `<img src="${issue.project.avatar}" class="project-avatar">` : ''}
                    <span>${issue.project.key}</span>
                  </div>
                  ${issue.assignee ? `
                    <div class="kanban-card-assignee">
                      <img src="${issue.assignee.avatar}" class="avatar avatar-xs" title="${issue.assignee.name}">
                    </div>
                  ` : `
                    <div class="kanban-card-assignee unassigned" title="Não atribuído">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    </div>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Event listeners para filtros
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

  // Drag and drop básico
  initDragAndDrop();
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
      // Aqui você pode implementar a lógica de movimentação
      // Por enquanto, apenas visual
    });
  });
}