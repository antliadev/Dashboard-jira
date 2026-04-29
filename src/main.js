/**
 * main.js — Ponto de entrada da aplicação
 * Sistema de autenticação com guards de rota
 */
import './styles/main.css';
import { initRouter, registerRoute, setNotFound, getRoutePath, registerGuard } from './utils/router.js';
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
const PUBLIC_ROUTES = ['/login'];

// ─── Estado de autenticação ───────────────────────────────

let authState = {
  isAuthenticated: false,
  sessionId: null,
  isChecking: false
};

// ─── Configuração de Rotas ────────────────────────────────

registerRoute('/', renderDashboard);
registerRoute('/login', renderLogin);
registerRoute('/projects', renderProjects);
registerRoute('/cards', renderCards);
registerRoute('/analysts', renderAnalysts);
registerRoute('/board', renderBoard);
registerRoute('/data', renderData);
registerRoute('/executive', renderExecutive);
registerRoute('/executive/:projectKey', renderExecutive);

// Rotas de detalhe
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

// ─── Sistema de Autenticação ──────────────────────────────

/**
 * Verificação síncrona local (rápida)
 * Retorna true se tem sessionId, false se não tem
 */
function hasLocalSession() {
  return !!localStorage.getItem('sessionId');
}

/**
 * Limpa sessão e redireciona para login
 */
function clearSessionAndRedirect() {
  localStorage.removeItem('sessionId');
  authState.isAuthenticated = false;
  authState.sessionId = null;
  window.location.hash = '#/login';
}

/**
 * Verifica autenticação com o servidor (assíncrona)
 * Executa APENSAH se tem sessionId local
 */
async function verifySessionWithServer() {
  const sessionId = localStorage.getItem('sessionId');
  
  if (!sessionId) {
    return false;
  }
  
  try {
    const response = await fetch('/api/auth/check', {
      headers: { 'x-session-id': sessionId }
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.authenticated === true;
  } catch (err) {
    // Erro de rede - mantém sessão local temporariamente
    console.warn('Auth: erro ao verificar sessão com servidor');
    return true; // Permite continuar, será verificado novamente
  }
}

/**
 * Guard de rota - executa antes de cada renderização
 * Retorna true = permite, false = bloqueia
 */
async function authGuard(path) {
  // Se está em rota pública, permite
  if (PUBLIC_ROUTES.includes(path)) {
    return true;
  }
  
  // Se não tem sessão local, bloqueia
  if (!hasLocalSession()) {
    window.location.hash = '#/login';
    return false;
  }
  
  // Tem sessão local - verifica com servidor
  const isValid = await verifySessionWithServer();
  
  if (!isValid) {
    clearSessionAndRedirect();
    return false;
  }
  
  // Sessão válida - atualizar estado
  authState.isAuthenticated = true;
  authState.sessionId = localStorage.getItem('sessionId');
  
  return true;
}

/**
 * Atualiza o layout baseado no estado de autenticação
 */
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

// Expor globalmente
window.updateLayout = updateLayout;

// Função de logout global
window.logout = async function() {
  const sessionId = localStorage.getItem('sessionId');
  
  if (sessionId) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-session-id': sessionId }
      });
    } catch (e) {
      // Ignora erro no logout
    }
  }
  
  clearSessionAndRedirect();
};

// ─── Inicialização ────────────────────────────────────────

async function initApp() {
  // Registrar guard ANTES de iniciar router
  registerGuard(authGuard);
  
  // Verificação inicial - síncrona e rápida
  const hasSession = hasLocalSession();
  
  if (!hasSession) {
    // Sem sessão - mostra login sem renderizar nada
    updateLayout(false);
    initRouter();
    return;
  }
  
  // Tem sessão local - verifica com servidor
  const isValid = await verifySessionWithServer();
  
  if (!isValid) {
    // Sessão inválida
    clearSessionAndRedirect();
    return;
  }
  
  // Sessão válida - inicializa normalmente
  authState.isAuthenticated = true;
  authState.sessionId = localStorage.getItem('sessionId');
  updateLayout(true);
  renderSidebar();
  initRouter();

  // Carregar dados do Jira
  try {
    await dataService.loadConfig();
    const syncStatus = await dataService.getSyncStatus();
    
    if (syncStatus.isConfigured) {
      try {
        await dataService.loadJiraData();
        console.log('Jira Dashboard: Dados carregados com sucesso.');
      } catch (err) {
        console.warn('Jira Dashboard: Falha ao carregar dados existentes:', err.message);
      }
    }
  } catch (error) {
    console.warn('Erro ao inicializar:', error.message);
  }

  // Escutar mudanças no serviço de dados
  dataService.subscribe(() => {
    renderSidebar();
  });

  console.log('Jira Dashboard inicializado com sucesso.');
}

// Aguardar DOM
document.addEventListener('DOMContentLoaded', initApp);