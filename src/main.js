/**
 * main.js — Ponto de entrada da aplicação
 * Autenticação opcional quando credenciais do Jira estão configuradas
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound, setAuthGuard } from './utils/router.js';
import { renderSidebar } from './components/sidebar.js';
import { dataService } from './data/data-service.js';

// Cache de módulos carregados (lazy loading)
const pageModules = {};

// Mapa de páginas para seus caminhos de importação
const pageImports = {
  '/': () => import('./pages/dashboard.js'),
  '/login': () => import('./pages/login.js'),
  '/projects': () => import('./pages/projects.js'),
  '/cards': () => import('./pages/cards.js'),
  '/analysts': () => import('./pages/analysts.js'),
  '/data': () => import('./pages/data.js'),
  '/board': () => import('./pages/board.js'),
  '/executive': () => import('./pages/executive.js'),
};

// Carregamento lazy de páginas
async function loadPage(path) {
  const normalizedPath = path.split('?')[0]; // remover query params
  
  if (!pageModules[normalizedPath]) {
    const importFn = pageImports[normalizedPath];
    if (importFn) {
      const module = await importFn();
      pageModules[normalizedPath] = module.renderDashboard || module.renderLogin || 
        module.renderProjects || module.renderCards || module.renderAnalysts || 
        module.renderData || module.renderBoard || module.renderExecutive;
    }
  }
  
  return pageModules[normalizedPath];
}

// Rotas públicas (não requerem autenticação)
const publicRoutes = ['/login'];

// ─── Configuração de Rotas ──────────────────────────────

// Registrar rotas com lazy loading
registerRoute('/', async () => {
  const { renderDashboard } = await import('./pages/dashboard.js');
  renderDashboard();
});
registerRoute('/login', async () => {
  const { renderLogin } = await import('./pages/login.js');
  renderLogin();
});
registerRoute('/projects', async () => {
  const { renderProjects } = await import('./pages/projects.js');
  renderProjects();
});
registerRoute('/cards', async () => {
  const { renderCards } = await import('./pages/cards.js');
  renderCards();
});
registerRoute('/analysts', async () => {
  const { renderAnalysts } = await import('./pages/analysts.js');
  renderAnalysts();
});
registerRoute('/board', async () => {
  const { renderBoard } = await import('./pages/board.js');
  renderBoard();
});
registerRoute('/data', async () => {
  const { renderData } = await import('./pages/data.js');
  renderData();
});
registerRoute('/executive', async () => {
  const { renderExecutive } = await import('./pages/executive.js');
  renderExecutive();
});
registerRoute('/executive/:projectKey', async (params) => {
  const { renderExecutive } = await import('./pages/executive.js');
  renderExecutive(params);
});

// Rotas de detalhe ( redireciona para board com filtro)
registerRoute('/projects/:id', (params) => {
  const project = dataService.getProjectById(params.id);
  if (project) {
    window.location.hash = `#/board?projectKey=${project.key}`;
  } else {
    window.location.hash = '#/board';
  }
});

registerRoute('/analysts/:id', (params) => {
  window.location.hash = `#/board?analystId=${params.id}`;
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

// ─── Sistema de Autenticação Opcional ───────────────────

// Verifica se tem sessão no localStorage
function getSessionId() {
  return localStorage.getItem('sessionId');
}

function setSessionId(sessionId) {
  localStorage.setItem('sessionId', sessionId);
}

function clearSession() {
  localStorage.removeItem('sessionId');
}

// Guard do router — login OBRIGATÓRIO
async function authGuard(path) {
  // Se é rota pública, permite
  if (publicRoutes.includes(path)) {
    return true;
  }

  // Verifica se tem sessão local
  const sessionId = getSessionId();

  if (!sessionId) {
    // Sem sessão — redireciona para login
    window.location.hash = '#/login';
    return false;
  }

  // Tem sessão — valida com servidor
  try {
    const response = await fetch('/api/auth', {
      method: 'GET',
      headers: { 'x-session-id': sessionId }
    });

    const data = await response.json();

    if (data.authenticated) {
      return true;
    }

    // Sessão inválida — limpar e redirecionar
    clearSession();
    window.location.hash = '#/login';
    return false;
  } catch (err) {
    // Erro de rede — permitir acesso local (dev)
    console.warn('[Auth] Erro de rede ao verificar sessão, permitindo acesso');
    return true;
  }
}

// ─── Layout do Sistema ──────────────────────────────────

function updateLayout(authenticated) {
  const sidebar = document.getElementById('sidebar');
  
  if (authenticated) {
    sidebar?.classList.remove('hidden');
    document.body.classList.remove('login-only');
  } else {
    sidebar?.classList.add('hidden');
    document.body.classList.add('login-only');
  }
}

window.updateLayout = updateLayout;
window.setSessionId = setSessionId;
window.clearSession = clearSession;

// ─── Inicialização ──────────────────────────────────────

async function initApp() {
  // Define o guard de autenticação
  setAuthGuard(authGuard);

  // Inicializa o router
  initRouter();

  // Verifica autenticação inicial para renderizar sidebar
  const currentPath = window.location.hash.replace(/^#\/?/, '/') || '/';
  
  if (!publicRoutes.includes(currentPath)) {
    const sessionId = getSessionId();
    
    if (sessionId) {
      try {
        const response = await fetch('/api/auth?check=1', {
          method: 'GET',
          headers: { 'x-session-id': sessionId }
        });
        const data = await response.json();
        
        if (data.authenticated) {
          updateLayout(true);
          renderSidebar();
        } else {
          // Sessão inválida - tenta carregar dados
          updateLayout(true);
          renderSidebar();
        }
      } catch (err) {
        // Erro - mostra layout completo
        updateLayout(true);
        renderSidebar();
      }
    } else {
      // Sem sessão - mostra layout completo (vai verificar credenciais via router)
      updateLayout(true);
      renderSidebar();
    }
  }
  
  // Se é rota pública e é login, mostra sem sidebar
  if (currentPath === '/login') {
    updateLayout(false);
  } else if (publicRoutes.includes(currentPath)) {
    updateLayout(true);
    renderSidebar();
  }
}

// Aguardar DOM
document.addEventListener('DOMContentLoaded', initApp);