/**
 * dashboard.js — Página principal de visão executiva
 */
import { dataService } from '../data/data-service.js';
import { PRIORITY_COLORS, STATUS_COLORS, healthLabel, HEALTH_COLORS, sanitize } from '../utils/helpers.js';
import Chart from 'chart.js/auto';

let dashboardChart = null;
let projectDistributionChart = null;

export function renderDashboard() {
  const header = document.getElementById('page-header');
  const metadata = dataService.getSyncMetadata();
  
  header.innerHTML = `
    <div>
      <h2>Dashboard Executivo</h2>
      <div class="subtitle" style="display: flex; align-items: center; gap: 12px;">
        <span>Visão geral de todos os projetos e entregas</span>
        <span style="width: 1px; height: 12px; background: var(--border);"></span>
        <span style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Atualizado em: ${metadata.lastSyncedAt ? formatDateTime(metadata.lastSyncedAt) : 'Nunca'}
          ${metadata.lastSyncStatus === 'running' ? '<span style="color: var(--info); animation: pulse 1s infinite;">(Sincronizando...)</span>' : ''}
        </span>
      </div>
    </div>
    <div class="page-actions">
      <select id="global-project-filter" class="btn btn-secondary" style="min-width: 180px;">
        <option value="">Todos os Projetos</option>
        ${dataService.getProjects().map(p => `<option value="${sanitize(p.id)}">${sanitize(p.name)}</option>`).join('')}
      </select>
    </div>
  `;

  renderDashboardContent();

  // Listener para o filtro global
  document.getElementById('global-project-filter').addEventListener('change', (e) => {
    renderDashboardContent(e.target.value);
  });
}

function renderDashboardContent(projectId = null) {
  const content = document.getElementById('page-content');
  const stats = dataService.getDashboardStats(projectId);
  const projects = dataService.getProjects();
  
  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Projetos Ativos</div>
        <div class="kpi-value">${stats.totalProjects}</div>
        <div class="kpi-icon" style="background: rgba(99,102,241,0.1); color: #6366f1;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total de Cards</div>
        <div class="kpi-value">${stats.totalCards}</div>
        <div class="kpi-icon" style="background: rgba(59,130,246,0.1); color: #3b82f6;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Em Andamento</div>
        <div class="kpi-value">${stats.byCategory.in_progress}</div>
        <div class="kpi-icon" style="background: rgba(16,185,129,0.1); color: #10b981;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Atrasados</div>
        <div class="kpi-value ${stats.overdue > 0 ? 'text-danger' : ''}">${stats.overdue}</div>
        <div class="kpi-icon" style="background: rgba(239,68,68,0.1); color: #ef4444;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Saúde de Dados</div>
        <div class="kpi-value ${stats.inconsistent > 0 ? 'text-warning' : ''}">${stats.inconsistent}</div>
        <div class="kpi-icon" style="background: rgba(245,158,11,0.1); color: #f59e0b;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <h3>Distribuição por Status</h3>
        <canvas id="statusChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Carga de Trabalho por Analista</h3>
        <canvas id="workloadChart"></canvas>
      </div>
      <div class="chart-card chart-full">
        <h3>Progresso por Projeto</h3>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Saúde</th>
                <th>Progresso</th>
                <th>Status</th>
                <th>Atrasados</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map(p => {
                const pStats = dataService.getProjectStats(p.id);
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 600;">${sanitize(p.name)}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">${sanitize(p.key)}</div>
                    </td>
                    <td>
                      <span class="badge badge-health-${pStats.health}">${healthLabel(pStats.health)}</span>
                    </td>
                    <td style="width: 200px;">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="progress-bar" style="flex: 1;">
                          <div class="fill" style="width: ${pStats.progress}%;"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: 600;">${pStats.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <div style="display: flex; gap: 4px;">
                        <span class="badge badge-todo" title="A Fazer">${pStats.todo}</span>
                        <span class="badge badge-progress" title="Em Andamento">${pStats.inProgress}</span>
                        <span class="badge badge-done" title="Concluído">${pStats.done}</span>
                      </div>
                    </td>
                    <td>
                      <span class="${pStats.overdue > 0 ? 'badge badge-overdue' : ''}">${pStats.overdue}</span>
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="location.hash='#/projects/${sanitize(p.id)}'">Detalhes</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  initCharts(projectId);
}

function initCharts(projectId) {
  const stats = dataService.getDashboardStats(projectId);
  const workload = dataService.getWorkloadByAnalyst(projectId);

  // Destruir gráficos anteriores se existirem
  if (dashboardChart) dashboardChart.destroy();
  if (projectDistributionChart) projectDistributionChart.destroy();

  const ctxStatus = document.getElementById('statusChart').getContext('2d');
  dashboardChart = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['A Fazer', 'Em Andamento', 'Concluído', 'Bloqueado'],
      datasets: [{
        data: [stats.byCategory.todo, stats.byCategory.in_progress, stats.byCategory.done, stats.byCategory.blocked],
        backgroundColor: [STATUS_COLORS.todo, STATUS_COLORS.in_progress, STATUS_COLORS.done, STATUS_COLORS.blocked],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9ca3b8', padding: 20, font: { size: 11 } } }
      },
      cutout: '70%'
    }
  });

  const ctxWorkload = document.getElementById('workloadChart').getContext('2d');
  projectDistributionChart = new Chart(ctxWorkload, {
    type: 'bar',
    data: {
      labels: workload.map(w => w.user.displayName),
      datasets: [
        {
          label: 'Em Andamento',
          data: workload.map(w => w.inProgress),
          backgroundColor: STATUS_COLORS.in_progress,
        },
        {
          label: 'Total de Cards',
          data: workload.map(w => w.total),
          backgroundColor: 'rgba(148, 163, 184, 0.2)',
        }
      ]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: { stacked: false, grid: { display: false }, ticks: { color: '#9ca3b8' } },
        y: { stacked: false, grid: { display: false }, ticks: { color: '#9ca3b8' } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9ca3b8', font: { size: 11 } } }
      }
    }
  });
}
