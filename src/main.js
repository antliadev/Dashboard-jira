/**
 * main.js — Ponto de entrada da aplicação
 * Com sistema robusto de autenticação
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound, getRoutePath, setAuthGuard } from './utils/router.js';
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

// ─── Sistema de Autenticação Robusto ─────────────────────

// Estado global de autenticação
let authState = {
  isAuthenticated: false,
  sessionId: null,
  checking: false
};

/**
 * Verifica autenticação de forma robusta:
 * 1. Primeiro verifica localStorage (síncrono, rápido)
 * 2. Depois verifica com servidor (assíncrono)
 * 3. Bloqueia navegação se não autenticado
 */
async function verifyAuth(path) {
  // Se já está verificando, não deixa passar
  if (authState.checking) {
    return false;
  }

  // Se é rota pública, permite
  if (publicRoutes.includes(path)) {
    return true;
  }

  // Verificação local primeiro (síncrona)
  const sessionId = localStorage.getItem('sessionId');
  
  if (!sessionId) {
    // Sem sessão - redireciona para login
    window.location.hash = '#/login';
    return false;
  }

  // Tem sessão local - verifica com servidor
  authState.checking = true;
  
  try {
    const response = await fetch('/api/auth/check', {
      headers: {
        'x-session-id': sessionId
      }
    });
    
    const data = await response.json();
    authState.checking = false;
    
    if (data.authenticated) {
      authState.isAuthenticated = true;
      authState.sessionId = sessionId;
      return true;
    } else {
      // Sessão inválida no servidor
      localStorage.removeItem('sessionId');
      window.location.hash = '#/login';
      return false;
    }
  } catch (err) {
    // Erro de rede - assume não autenticado por segurança
    authState.checking = false;
    localStorage.removeItem('sessionId');
    window.location.hash = '#/login';
    return false;
  }
}

/**
 * Guard do router - executa ANTES de qualquer renderização
 */
async function authGuard(path) {
  const hasAccess = await verifyAuth(path);
  
  if (!hasAccess) {
    // Atualiza layout para oculto
    document.body.classList.add('login-only');
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.add('hidden');
    return false;
  }
  
  // Autenticado - mostra layout completo
  document.body.classList.remove('login-only');
  const sidebar = document.getElementById('sidebar');
  sidebar?.classList.remove('hidden');
  
  return true;
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

// ─── Inicialização ──────────────────────────────────────

async function initApp() {
  // Define o guard de autenticação NO ROUTER
  setAuthGuard(authGuard);

  // Inicializa o router (o guard vai拦截 todas as rotas)
  initRouter();

  // Verifica autenticação inicial
  const currentPath = getRoutePath();
  
  if (publicRoutes.includes(currentPath)) {
    // É rota pública - mostra layout normal se for /login
    if (currentPath === '/login') {
      updateLayout(false);
    }
    return;
  }

  // É rota protegida - verifica auth
  const hasAccess = await verifyAuth(currentPath);
  
  if (hasAccess) {
    updateLayout(true);
    renderSidebar();
    
    // Carrega dados
    try {
      await dataService.loadConfig();
      const syncStatus = await dataService.getSyncStatus();
      
      if (syncStatus.isConfigured) {
        try {
          await dataService.loadJiraData();
          console.log('Jira Dashboard: Dados carregados com sucesso.');
        } catch (err) {
          console.warn('Jira Dashboard: Falha ao carregar dados:', err.message);
        }
      }
    } catch (error) {
      console.warn('Erro ao inicializar:', error.message);
    }

    dataService.subscribe(() => {
      renderSidebar();
    });
    
    console.log('Jira Dashboard inicializado com sucesso.');
  } else {
    // Não autenticado - layout já atualizado pelo guard
    console.log('Acesso bloqueado - redirecionando para login');
  }
}

// Aguardar DOM
document.addEventListener('DOMContentLoaded', initApp);