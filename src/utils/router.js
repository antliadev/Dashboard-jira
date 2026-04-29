/**
 * router.js — SPA Router simples baseado em hash
 * Suporta rotas com parâmetros (/project/:id)
 * Inclui sistema de guards para proteção de rotas
 */

const routes = new Map();
let currentRoute = null;
let notFoundHandler = null;

// Guards de rota - funções que executam antes de renderizar
const routeGuards = [];

/**
 * Registra um guard que será executado antes de cada rota
 * O guard deve retornar:
 * - true: permite acesso à rota
 * - false: bloqueia acesso (o guard redireciona)
 */
export function registerGuard(guardFn) {
  routeGuards.push(guardFn);
}

export function registerRoute(path, handler) {
  routes.set(path, handler);
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigateTo(path) {
  window.location.hash = '#' + path;
}

export function getCurrentRoute() {
  return currentRoute;
}

export function getRoutePath() {
  return window.location.hash.replace(/^#\/?/, '/') || '/';
}

/**
 * Executa todos os guards para uma rota
 * Retorna true se todos permitirem, false se algum bloquear
 */
async function runGuards(path) {
  for (const guard of routeGuards) {
    const result = await guard(path);
    if (!result) {
      return false;
    }
  }
  return true;
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
  const handleRoute = async () => {
    const hash = window.location.hash || '#/';
    const path = hash.replace(/^#\/?/, '/') || '/';
    
    // Executar guards ANTES de renderizar qualquer coisa
    const guardsPassed = await runGuards(path);
    
    if (!guardsPassed) {
      // Guard bloqueou - não renderiza nada
      return;
    }
    
    const result = matchRoute(hash);
    
    if (result) {
      currentRoute = path;
      result.handler(result.params);
      
      // Atualizar sidebar ativa
      document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('data-route');
        item.classList.toggle('active', hash.startsWith('#' + href));
      });
    } else if (notFoundHandler) {
      notFoundHandler();
    }
  };

  // Interceptar todas as mudanças de hash
  window.addEventListener('hashchange', handleRoute);
  
  // Primeira execução
  handleRoute();
}