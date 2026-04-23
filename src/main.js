/**
 * main.js — Ponto de entrada da aplicação
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound } from './utils/router.js';
import { renderSidebar } from './components/sidebar.js';
import { dataService } from './data/data-service.js';

// Importação das páginas
import { renderDashboard } from './pages/dashboard.js';
import { renderProjects } from './pages/projects.js';
import { renderCards } from './pages/cards.js';
import { renderAnalysts } from './pages/analysts.js';
import { renderData } from './pages/data.js';

// ─── Configuração de Rotas ────────────────────────────

registerRoute('/', renderDashboard);
registerRoute('/projects', renderProjects);
registerRoute('/cards', renderCards);
registerRoute('/analysts', renderAnalysts);
registerRoute('/data', renderData);

// Rotas de detalhe (Placeholders para futura expansão)
registerRoute('/projects/:id', (params) => {
  // Renderiza a listagem de cards filtrada por projeto como visão de detalhe inicial
  window.location.hash = `#/cards?projectId=${params.id}`;
});

registerRoute('/analysts/:id', (params) => {
  window.location.hash = `#/cards?assigneeId=${params.id}`;
});

setNotFound(() => {
  document.getElementById('page-content').innerHTML = `
    <div class="empty-state">
      <h3>Página não encontrada</h3>
      <p>A página que você está procurando não existe ou foi movida.</p>
      <button class="btn btn-primary" onclick="location.hash='#/'">Voltar ao Dashboard</button>
    </div>
  `;
});

// ─── Inicialização ────────────────────────────────────

function initApp() {
  // Renderizar componentes estáticos
  renderSidebar();

  // Inicializar roteador
  initRouter();

  // Escutar mudanças no serviço de dados para re-renderizar a sidebar (badge de fonte)
  dataService.subscribe(() => {
    renderSidebar();
    // Forçar re-render da página atual se necessário (opcional)
  });

  console.log('Jira Dashboard inicializado com sucesso.');
}

// Aguardar DOM
document.addEventListener('DOMContentLoaded', initApp);
