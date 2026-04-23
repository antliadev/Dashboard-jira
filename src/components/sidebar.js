/**
 * sidebar.js — Componente de navegação lateral
 */
import { dataService } from '../data/data-service.js';
import { navigateTo } from '../utils/router.js';

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
  analysts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
};

export function renderSidebar() {
  const source = dataService.source;
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="logo-icon">JD</div>
        <h1>Jira Dash</h1>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Principal</div>
      <button class="nav-item" data-route="/" onclick="location.hash='#/'">${ICONS.dashboard}<span>Dashboard</span></button>
      <button class="nav-item" data-route="/projects" onclick="location.hash='#/projects'">${ICONS.projects}<span>Projetos</span></button>
      <button class="nav-item" data-route="/cards" onclick="location.hash='#/cards'">${ICONS.cards}<span>Cards / Issues</span></button>
      <button class="nav-item" data-route="/analysts" onclick="location.hash='#/analysts'">${ICONS.analysts}<span>Analistas</span></button>
      <div class="nav-section">Configuração</div>
      <button class="nav-item" data-route="/data" onclick="location.hash='#/data'">${ICONS.data}<span>Dados</span></button>
    </nav>
    <div class="sidebar-footer">
      <div class="data-source-badge">
        <span class="dot ${source}"></span>
        <span>Fonte: <strong>${source === 'mock' ? 'Mock Data' : source === 'imported' ? 'Importado' : 'API Jira'}</strong></span>
      </div>
    </div>
  `;
}
