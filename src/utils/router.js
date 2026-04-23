/**
 * router.js — SPA Router simples baseado em hash
 * Suporta rotas com parâmetros (/project/:id)
 */

const routes = new Map();
let currentRoute = null;
let notFoundHandler = null;

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
  const handle = () => {
    const hash = window.location.hash || '#/';
    const result = matchRoute(hash);
    
    if (result) {
      currentRoute = hash.replace(/^#\/?/, '/');
      result.handler(result.params);
    } else if (notFoundHandler) {
      notFoundHandler();
    }
    
    // Atualizar sidebar ativa
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('data-route');
      item.classList.toggle('active', hash.startsWith('#' + href));
    });
  };

  window.addEventListener('hashchange', handle);
  handle(); // Executa na inicialização
}
