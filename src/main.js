/**
 * main.js — Ponto de entrada da aplicação
 * Autenticação opcional quando credenciais do Jira estão configuradas
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound, setAuthGuard } from './utils/router.js';
import { renderSidebar } from './components/sidebar.js';
import { dataService } from './data/data-service.js';
import { sanitize } from './utils/helpers.js';

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
const dataRoutes = new Set(['/', '/projects', '/cards', '/analysts', '/board', '/executive', '/gantt']);
const AUTH_CACHE_TTL_MS = 30000;
let authCache = {
  sessionId: null,
  authenticated: false,
  checkedAt: 0
};

function normalizePath(path) {
  return (path || '/').split('?')[0] || '/';
}

function renderDataLoading() {
  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');
  if (header) {
    header.innerHTML = `
      <div>
        <h2>Carregando dados</h2>
        <div class="subtitle">Lendo dados persistidos no Supabase</div>
      </div>
    `;
  }
  if (content) {
    content.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  }
}

function renderDataLoadError(error) {
  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');
  if (header) {
    header.innerHTML = `
      <div>
        <h2>Falha ao carregar dados</h2>
        <div class="subtitle">Dashboard depende do Supabase como fonte principal</div>
      </div>
    `;
  }
  if (content) {
    content.innerHTML = `
      <div class="empty-state">
        <h3>Dados persistidos indisponiveis</h3>
        <p>${sanitize(error?.message || 'Nao foi possivel carregar /api/jira/dashboard.')}</p>
        <button class="btn btn-primary" id="retry-data-load">Tentar novamente</button>
        <button class="btn btn-secondary" onclick="location.hash='#/data'">Ir para Dados</button>
      </div>
    `;
    document.getElementById('retry-data-load')?.addEventListener('click', () => {
      dataService.ensureLoaded({ force: true }).then(() => {
        renderSidebar();
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }).catch(renderDataLoadError);
    });
  }
}

async function renderRoute(importPage, renderName, params = {}, options = {}) {
  const path = normalizePath(window.location.hash.replace(/^#\/?/, '/') || '/');
  if (dataRoutes.has(path) && !options.skipDataLoad) {
    if (!dataService.isLoaded) renderDataLoading();
    try {
      await dataService.ensureLoaded();
      renderSidebar();
    } catch (error) {
      renderDataLoadError(error);
      return;
    }
  }

  const module = await importPage();
  module[renderName](params);
}

// ─── Configuração de Rotas ──────────────────────────────

// Registrar rotas com lazy loading
registerRoute('/', () => renderRoute(() => import('./pages/dashboard.js'), 'renderDashboard'));
registerRoute('/login', () => renderRoute(() => import('./pages/login.js'), 'renderLogin', {}, { skipDataLoad: true }));
registerRoute('/projects', () => renderRoute(() => import('./pages/projects.js'), 'renderProjects'));
registerRoute('/cards', () => renderRoute(() => import('./pages/cards.js'), 'renderCards'));
registerRoute('/analysts', () => renderRoute(() => import('./pages/analysts.js'), 'renderAnalysts'));
registerRoute('/board', () => renderRoute(() => import('./pages/board.js'), 'renderBoard'));
registerRoute('/data', () => renderRoute(() => import('./pages/data.js'), 'renderData', {}, { skipDataLoad: true }));
registerRoute('/executive', () => renderRoute(() => import('./pages/executive.js'), 'renderExecutive'));
registerRoute('/executive/:projectKey', (params) => renderRoute(() => import('./pages/executive.js'), 'renderExecutive', params));
registerRoute('/gantt', () => renderRoute(() => import('./pages/gantt.js'), 'renderGantt'));

// Rotas de detalhe ( redireciona para board com filtro)
registerRoute('/projects/:id', async (params) => {
  try {
    await dataService.ensureLoaded();
  } catch (error) {
    renderDataLoadError(error);
    return;
  }
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
  authCache = {
    sessionId,
    authenticated: true,
    checkedAt: Date.now()
  };
}

function clearSession() {
  localStorage.removeItem('sessionId');
  authCache = {
    sessionId: null,
    authenticated: false,
    checkedAt: 0
  };
}

// Helper para fetch com timeout
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Guard do router — login OBRIGATÓRIO
async function authGuard(path) {
  path = normalizePath(path);
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

  // Tem sessão — valida com servidor (com timeout)
  const now = Date.now();
  if (
    authCache.sessionId === sessionId &&
    authCache.authenticated &&
    now - authCache.checkedAt < AUTH_CACHE_TTL_MS
  ) {
    return true;
  }

  try {
    const response = await fetchWithTimeout('/api/auth', {
      method: 'GET',
      headers: { 'x-session-id': sessionId }
    }, 5000);

    if (!response.ok) {
      // Erro HTTP - sessão inválida
      clearSession();
      window.location.hash = '#/login';
      return false;
    }

    const data = await response.json();

    if (data.authenticated) {
      authCache = {
        sessionId,
        authenticated: true,
        checkedAt: Date.now()
      };
      return true;
    }

    // Sessão inválida — limpar e redirecionar
    clearSession();
    window.location.hash = '#/login';
    return false;
  } catch (err) {
    // Timeout ou erro de rede - permitir acesso
    // Em produção, se o servidor não responde, permitimos acesso
    // O sistema verificará auth novamente nas chamadas de API
    console.warn('[Auth] Timeout ou erro, permitindo acesso:', err.message);
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
  const currentPath = normalizePath(window.location.hash.replace(/^#\/?/, '/') || '/');
  
  if (!publicRoutes.includes(currentPath)) {
    const sessionId = getSessionId();
    
    if (sessionId) {
      try {
        const response = await fetchWithTimeout('/api/auth?check=1', {
          method: 'GET',
          headers: { 'x-session-id': sessionId }
        }, 5000);
        const data = await response.json().catch(() => ({ authenticated: false }));
        
        if (data.authenticated) {
          authCache = {
            sessionId,
            authenticated: true,
            checkedAt: Date.now()
          };
          updateLayout(true);
          renderSidebar();
        } else {
          // Sessão inválida - tenta carregar dados
          clearSession();
          updateLayout(false);
          window.location.hash = '#/login';
        }
      } catch (err) {
        clearSession();
        updateLayout(false);
        window.location.hash = '#/login';
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
