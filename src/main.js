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
import { renderBoard } from './pages/board.js';
import { renderExecutive } from './pages/executive.js';

// ─── Configuração de Rotas ──────────────────────────────

registerRoute('/', renderDashboard);
registerRoute('/projects', renderProjects);
registerRoute('/cards', renderCards);
registerRoute('/analysts', renderAnalysts);
registerRoute('/board', renderBoard);
registerRoute('/data', renderData);
registerRoute('/executive', renderExecutive);
registerRoute('/executive/:projectKey', renderExecutive);

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

async function initApp() {
  // Renderizar componentes estáticos
  renderSidebar();

  // Inicializar roteador
  initRouter();

  // Carregar configuração e verificar se há dados salvos
  try {
    await dataService.loadConfig();
    
    const syncStatus = await dataService.getSyncStatus();
    
    // Se já está configurado e tem última sincronização bem-sucedida, carrega os dados
    if (syncStatus.isConfigured && syncStatus.lastSyncStatus === 'success') {
      await dataService.loadJiraData();
      console.log('Jira Dashboard conectado ao Jira Cloud com sucesso.');
    } else if (!syncStatus.isConfigured) {
      console.log('Jira não configurado. Use a página Dados para configurar.');
    }
  } catch (error) {
    console.warn('Erro ao inicializar:', error.message);
  }

  // Escutar mudanças no serviço de dados para re-renderizar a sidebar (badge de fonte)
  dataService.subscribe(() => {
    renderSidebar();
  });

  console.log('Jira Dashboard inicializado com sucesso.');
}

// Aguardar DOM
document.addEventListener('DOMContentLoaded', initApp);
