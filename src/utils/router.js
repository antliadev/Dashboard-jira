/**
 * router.js — SPA Router simples baseado em hash
 * Com sistema de Guards para proteção de rotas
 */

const routes = new Map();
let currentRoute = null;
let notFoundHandler = null;
let authGuard = null;

// ─── Registro de Rotas ─────────────────────────────────────

/**
 * Registra uma rota com seu handler
 */
export function registerRoute(pattern, handler) {
  routes.set(pattern, handler);
}

/**
 * Define o handler para rota não encontrada (404)
 */
export function setNotFound(handler) {
  notFoundHandler = handler;
}

// ─── Sistema de Guards ──────────────────────────────────

/**
 * Define o guard de autenticação
 * O guard recebe a rota destino e retorna:
 * - true: permite acesso
 * - false: bloqueia acesso (redireciona para login)
 */
export function setAuthGuard(guardFn) {
  authGuard = guardFn;
}

/**
 * Verifica se o acesso à rota é permitido
 */
async function checkAccess(path) {
  // Se não há guard definido, permite tudo
  if (!authGuard) return true;
  
  return await authGuard(path);
}

function matchRoute(hash) {
  const path = hash.replace(/^#\/?/, '/') || '/';
  
  // Busca direta
  if (routes.has(path)) return { handler: routes.get(path), params: {} };
  
  // Busca com parâmetros
  for (const [pattern, handler] of routes) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length !== pathParts.length) continue;
    
    const params = {};
    let match = true;
    
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    
    if (match) return { handler, params };
  }
  
  return null;
}

export function initRouter() {
  const handle = async () => {
    const path = window.location.hash.replace(/^#\/?/, '/') || '/';
    
    // ─── GUARD: Verifica autenticação ANTES de qualquer coisa ───
    const hasAccess = await checkAccess(path);
    
    if (!hasAccess) {
      // Guard bloqueou o acesso - não renderiza nada
      console.log('[Router] Access denied, redirecting to login');
      return;
    }
    // ─────────────────────────────────────────────────────────────
    
    const result = matchRoute(window.location.hash || '#/');
    
    if (result) {
      currentRoute = path;
      result.handler(result.params);
    } else if (notFoundHandler) {
      notFoundHandler();
    }
    
    // Atualizar sidebar ativa (se estiver visível)
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('data-route');
      item.classList.toggle('active', window.location.hash.startsWith('#' + href));
    });
  };

  window.addEventListener('hashchange', handle);
  handle(); // Executa na inicialização
}
