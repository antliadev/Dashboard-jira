/**
 * analysts.js — Página de listagem de analistas / devs
 */
import { dataService } from '../data/data-service.js';

export function renderAnalysts() {
  const header = document.getElementById('page-header');
  const content = document.getElementById('page-content');
  
  header.innerHTML = `
    <div>
      <h2>Analistas & Desenvolvedores</h2>
      <div class="subtitle">Visão de produtividade e carga de trabalho por membro da equipe</div>
    </div>
  `;

  const users = dataService.getUsersRanked();

  content.innerHTML = `
    <div class="analyst-grid">
      ${users.map(u => {
        const stats = u.stats;
        return `
          <div class="analyst-card" onclick="location.hash='#/analysts/${u.id}'">
            <img src="${u.avatarUrl}" class="avatar avatar-lg">
            <div class="analyst-info">
              <h3 class="analyst-name">${u.displayName}</h3>
              <div class="analyst-email">${u.email}</div>
              
              <div style="margin-top: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                  <span style="color: var(--text-muted);">Produtividade</span>
                  <span style="font-weight: 700; color: var(--success);">${stats.productivity}%</span>
                </div>
                <div class="progress-bar">
                  <div class="fill" style="width: ${stats.productivity}%; background: var(--success);"></div>
                </div>
              </div>

              <div class="analyst-metrics">
                <div class="metric">
                  <div class="metric-value">${stats.total}</div>
                  <div class="metric-label">Total</div>
                </div>
                <div class="metric">
                  <div class="metric-value" style="color: var(--info);">${stats.inProgress}</div>
                  <div class="metric-label">Ativas</div>
                </div>
                <div class="metric">
                  <div class="metric-value" style="color: var(--danger);">${stats.overdue}</div>
                  <div class="metric-label">Atrasos</div>
                </div>
              </div>

              <div style="margin-top: 16px;">
                <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; font-weight: 700;">Projetos</div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                  ${stats.projects.map(pid => {
                    const p = dataService.getProjectById(pid);
                    return p ? `<span class="badge" style="background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border);">${p.key}</span>` : '';
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
