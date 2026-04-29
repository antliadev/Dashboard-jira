/**
 * sidebar.js — Componente de navegação lateral
 */
import { dataService } from '../data/data-service.js';

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  executive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>',
  analysts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
};

export function renderSidebar() {
  const source = dataService?.source || 'mock';
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-header" role="banner">
      <div class="sidebar-logo">
        <div class="logo-icon" aria-hidden="true">JD</div>
        <h1>Jira Dash</h1>
      </div>
    </div>
    <nav class="sidebar-nav" role="navigation" aria-label="Menu principal">
      <div class="nav-section" role="heading" aria-level="2">Principal</div>
      <button class="nav-item" data-route="/" onclick="location.hash='#/'" aria-label="Ir para Dashboard">${ICONS.dashboard}<span>Dashboard</span></button>
      <button class="nav-item" data-route="/executive" onclick="location.hash='#/executive'" aria-label="Ir para Resumo Executivo">${ICONS.executive}<span>Resumo Executivo</span></button>
      <button class="nav-item" data-route="/board" onclick="location.hash='#/board'" aria-label="Ir para Board Kanban">${ICONS.board}<span>Board Kanban</span></button>
      <button class="nav-item" data-route="/projects" onclick="location.hash='#/projects'" aria-label="Ir para Projetos">${ICONS.projects}<span>Projetos</span></button>
      <button class="nav-item" data-route="/cards" onclick="location.hash='#/cards'" aria-label="Ir para Cards">${ICONS.cards}<span>Cards / Issues</span></button>
      <button class="nav-item" data-route="/analysts" onclick="location.hash='#/analysts'" aria-label="Ir para Analistas">${ICONS.analysts}<span>Analistas</span></button>
      <div class="nav-section" role="heading" aria-level="2">Configuração</div>
      <button class="nav-item" data-route="/data" onclick="location.hash='#/data'" aria-label="Ir para Dados">${ICONS.data}<span>Dados</span></button>
    </nav>
    <div class="sidebar-footer" role="contentinfo">
      <div class="data-source-badge" aria-label="Fonte de dados atual">
        <span class="dot ${source}" aria-hidden="true"></span>
        <span>Fonte: <strong>${source === 'mock' ? 'Mock Data' : source === 'imported' ? 'Importado' : 'API Jira'}</strong></span>
      </div>
    </div>
  `;
}
