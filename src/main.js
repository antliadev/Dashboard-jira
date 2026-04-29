/**
 * main.js — Ponto de entrada da aplicação
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound, getRoutePath } from './utils/router.js';
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
import { renderLogin } from './pages/login.js';

// Rotas públicas (não requerem autenticação)
const publicRoutes = ['/login', '/data'];

// ─── Configuração de Rotas ──────────────────────────────

registerRoute('/', renderDashboard);
registerRoute('/login', renderLogin);
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

// ─── Autenticação ────────────────────────────────────

async function checkAuth() {
  const sessionId = localStorage.getItem('sessionId');
  const currentPath = getRoutePath();
  
  // Se já está na página de login, não precisa verificar
  if (currentPath === '/login') {
    return true;
  }
  
  // Se é rota pública, permite acesso
  if (publicRoutes.includes(currentPath)) {
    return true;
  }
  
  // Se não tem sessão, redireciona para login
  if (!sessionId) {
    window.location.hash = '#/login';
    return false;
  }
  
  // Verifica sessão com o servidor
  try {
    const response = await fetch('/api/auth/check', {
      headers: {
        'x-session-id': sessionId
      }
    });
    
    if (!response.ok) {
      // Sessão inválida ou expirada
      localStorage.removeItem('sessionId');
      window.location.hash = '#/login';
      return false;
    }
    
    const data = await response.json();
    
    if (!data.authenticated) {
      localStorage.removeItem('sessionId');
      window.location.hash = '#/login';
      return false;
    }
    
    return true;
  } catch (err) {
    // Erro de rede, considera não autenticado
    localStorage.removeItem('sessionId');
    window.location.hash = '#/login';
    return false;
  }
}

// ─── Inicialização ────────────────────────────────────

async function initApp() {
  // Renderizar componentes estáticos
  renderSidebar();

  // Verificar autenticação primeiro
  const isAuthenticated = await checkAuth();
  
  // Se não autenticado e não é rota pública, o checkAuth já redirecionou
  if (!isAuthenticated) {
    const currentPath = getRoutePath();
    if (currentPath !== '/login') {
      return;
    }
  }

  // Inicializar roteador
  initRouter();

  // Carregar configuração e verificar se há dados salvos
  try {
    await dataService.loadConfig();
    
    const syncStatus = await dataService.getSyncStatus();
    
    // Sempre tenta carregar dados se estiver configurado, independente do status da última sincronização
    if (syncStatus.isConfigured) {
      try {
        await dataService.loadJiraData();
        console.log('Jira Dashboard: Dados carregados com sucesso.');
      } catch (err) {
        console.warn('Jira Dashboard: Falha ao carregar dados existentes:', err.message);
      }
    } else {
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
