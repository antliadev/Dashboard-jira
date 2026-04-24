/**
 * executive.js — Resumo Executivo do Projeto
 * Layout: 2 colunas (esquerda: Status + KPIs + Conquistas + Próximos Passos | direita: Progresso + Time + Riscos)
 */
import '../styles/executive.css';
import { dataService } from '../data/data-service.js';
import { formatDate } from '../utils/helpers.js';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Funções de exportação no escopo global
window.exportExecutivePNG = async function(projectKey) {
  const element = document.getElementById('executive-export-area');
  if (!element) {
    alert('Área de exportação não encontrada');
    return;
  }

  const btn = document.getElementById('export-png-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>Exportando...</span>';
  btn.disabled = true;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#0B0F1A',
      scale: 2,
      useCORS: true,
      logging: false
    });

    const link = document.createElement('a');
    link.download = 'resumo-executivo-' + projectKey + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    console.error('Erro ao exportar PNG:', e);
    alert('Erro ao exportar: ' + e.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window.exportExecutivePDF = async function(projectKey) {
  const element = document.getElementById('executive-export-area');
  if (!element) {
    alert('Área de exportação não encontrada');
    return;
  }

  const btn = document.getElementById('export-pdf-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>Exportando...</span>';
  btn.disabled = true;

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#0B0F1A',
      scale: 2,
      useCORS: true,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('resumo-executivo-' + projectKey + '.pdf');
  } catch (e) {
    console.error('Erro ao exportar PDF:', e);
    alert('Erro ao exportar: ' + e.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

export function renderExecutive(params) {
  const projectKey = params?.projectKey;
  
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Resumo Executivo</h2>
      <div class="subtitle">Painel executivo do projeto</div>
    </div>
    <div class="page-actions">
      <select class="executive-project-select" id="project-select" onchange="location.hash='#/executive/' + this.value">
        <option value="">Selecionar projeto...</option>
        ${dataService.getProjects().map(p => `<option value="${p.key}" ${p.key === projectKey ? 'selected' : ''}>${p.name}</option>`).join('')}
      </select>
    </div>
  `;

  renderExecutiveContent(projectKey);
}

function renderExecutiveContent(projectKey) {
  const content = document.getElementById('page-content');
  
  // Se não há projeto selecionado
  if (!projectKey) {
    content.innerHTML = `
      <div class="executive-page">
        <div class="executive-select-page">
          <div class="executive-select-container">
            <div class="executive-select-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
                <path d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"/>
              </svg>
            </div>
            <h2>Selecione um Projeto</h2>
            <p>Escolha um projeto para visualizar o resumo executivo</p>
            <div class="executive-select-grid">
              ${dataService.getProjects().map(p => `
                <button class="executive-select-card" onclick="location.hash='#/executive/${p.key}'">
                  <span class="executive-select-key">${p.key}</span>
                  <span class="executive-select-name">${p.name}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Buscar dados do projeto
  const summary = dataService.buildProjectExecutiveSummary(projectKey);
  
  if (!summary) {
    content.innerHTML = `
      <div class="executive-page">
        <div class="executive-empty">
          <div class="executive-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h3>Projeto não encontrado</h3>
          <p>O projeto ${projectKey} não possui dados sincronizados.</p>
          <button class="btn btn-primary" onclick="location.hash='#/data'">Sincronizar Dados</button>
        </div>
      </div>
    `;
    return;
  }

  const { project, healthStatus, healthLabel, progressPercent, totals, team, risks, achievements, nextSteps, lastSync } = summary;

  // Cores do semáforo
  const healthColors = {
    green: { bg: '#22C55E', light: 'rgba(34, 197, 94, 0.15)', glow: 'rgba(34, 197, 94, 0.3)' },
    yellow: { bg: '#F59E0B', light: 'rgba(245, 158, 11, 0.15)', glow: 'rgba(245, 158, 11, 0.3)' },
    red: { bg: '#EF4444', light: 'rgba(239, 68, 68, 0.15)', glow: 'rgba(239, 68, 68, 0.3)' }
  };
  
  const health = healthColors[healthStatus];

  // Calcular percentuais das barras
  const donePercent = totals.issues > 0 ? Math.round((totals.done / totals.issues) * 100) : 0;
  const progressBarPercent = totals.issues > 0 ? Math.round((totals.inProgress / totals.issues) * 100) : 0;
  const blockedBarPercent = totals.issues > 0 ? Math.round((totals.blocked / totals.issues) * 100) : 0;
  const otherPercent = Math.max(0, 100 - donePercent - progressBarPercent - blockedBarPercent);

  // Função para exibir ticket: key + " — " + title
  const formatTicket = (item) => {
    const title = item.title || 'Sem título';
    return `${item.key} — ${title}`;
  };

  content.innerHTML = `
    <div class="executive-page">
      <div class="executive-panel">
        
        <!-- HEADER -->
        <div class="executive-header">
          <div class="executive-header-left">
            <div class="executive-project-badge" style="background: linear-gradient(135deg, #3B82F6, #8B5CF6)">${project.key.substring(0, 2)}</div>
            <div class="executive-project-title">
              <h1>${project.name}</h1>
              <span class="executive-project-meta"><span class="executive-key-badge">${project.key}</span> • Atualizado ${formatDate(lastSync)}</span>
            </div>
          </div>
          <div class="executive-header-right">
            <span class="executive-company-text">ANTLIA</span>
            <button class="executive-export-btn" id="export-png-btn" onclick="exportExecutivePNG('${project.key}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              PNG
            </button>
            <button class="executive-export-btn" id="export-pdf-btn" onclick="exportExecutivePDF('${project.key}')" style="background: linear-gradient(135deg, #10B981, #059669)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
              </svg>
              PDF
            </button>
          </div>
        </div>

        <!-- WRAPPER PARA EXPORTAÇÃO -->
        <div id="executive-export-area" style="padding: 16px 0;">
        
        <!-- GRID PRINCIPAL: 2 COLUNAS -->
        <div class="executive-grid">
          
          <!-- COLUNA ESQUERDA -->
          <div class="executive-column">
            
            <!-- 1. STATUS GERAL -->
            <div class="executive-card executive-status-card" style="border-color: ${health.bg}; box-shadow: 0 4px 24px ${health.glow}, inset 0 0 40px ${health.light}">
              <div class="executive-status-content">
                <div class="executive-progress-ring">
                  <svg viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1F2937" stroke-width="8"/>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="${health.bg}" stroke-width="8" 
                      stroke-dasharray="${progressPercent * 2.64} 264" stroke-linecap="round" 
                      transform="rotate(-90 50 50)">
                      <animate attributeName="stroke-dasharray" from="0 264" to="${progressPercent * 2.64} 264" dur="1s" fill="freeze"/>
                    </circle>
                  </svg>
                  <div class="executive-progress-text">
                    <span class="executive-percent" style="color: ${health.bg}">${progressPercent}%</span>
                    <span class="executive-label">concluído</span>
                  </div>
                </div>
                <div class="executive-status-info">
                  <div class="executive-status-label" style="color: ${health.bg}">${healthLabel.toUpperCase()}</div>
                  <div class="executive-status-desc">Saúde geral do projeto</div>
                  <div class="executive-traffic-mini">
                    <span class="executive-traffic-dot ${healthStatus === 'green' ? 'active' : ''}" style="background: #22C55E"></span>
                    <span class="executive-traffic-dot ${healthStatus === 'yellow' ? 'active' : ''}" style="background: #F59E0B"></span>
                    <span class="executive-traffic-dot ${healthStatus === 'red' ? 'active' : ''}" style="background: #EF4444"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. KPIs -->
            <div class="executive-kpis-grid">
              <div class="executive-kpi-card">
                <div class="executive-kpi-icon">📊</div>
                <div class="executive-kpi-value">${totals.issues}</div>
                <div class="executive-kpi-label">Total</div>
              </div>
              <div class="executive-kpi-card done">
                <div class="executive-kpi-icon">✓</div>
                <div class="executive-kpi-value">${totals.done}</div>
                <div class="executive-kpi-label">Concluídos</div>
              </div>
              <div class="executive-kpi-card progress">
                <div class="executive-kpi-icon">⚡</div>
                <div class="executive-kpi-value">${totals.inProgress}</div>
                <div class="executive-kpi-label">Em Andamento</div>
              </div>
              <div class="executive-kpi-card blocked">
                <div class="executive-kpi-icon">🚧</div>
                <div class="executive-kpi-value">${totals.blocked}</div>
                <div class="executive-kpi-label">Bloqueados</div>
              </div>
            </div>

            <!-- 3. ÚLTIMAS CONQUISTAS -->
            <div class="executive-card executive-list-card">
              <div class="executive-card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Últimas Conquistas
              </div>
              <div class="executive-list-content">
                ${achievements.length > 0 ? achievements.map(a => `
                  <div class="executive-list-item achievement">
                    <span class="executive-list-icon">✓</span>
                    <div class="executive-list-body">
                      <span class="executive-list-title" title="${a.title}">${formatTicket(a)}</span>
                      <span class="executive-list-meta">${formatDate(a.resolvedAt)}</span>
                    </div>
                  </div>
                `).join('') : '<div class="executive-list-empty">Nenhuma conquista ainda</div>'}
              </div>
            </div>

            <!-- 4. PRÓXIMOS PASSOS -->
            <div class="executive-card executive-list-card">
              <div class="executive-card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Próximos Passos
              </div>
              <div class="executive-list-content">
                ${nextSteps.length > 0 ? nextSteps.map(n => `
                  <div class="executive-list-item">
                    <span class="executive-list-priority priority-${n.priority?.toLowerCase() || 'medium'}">${n.priority || 'Medium'}</span>
                    <div class="executive-list-body">
                      <span class="executive-list-title" title="${n.title}">${formatTicket(n)}</span>
                      <span class="executive-list-meta">${n.status}</span>
                    </div>
                  </div>
                `).join('') : '<div class="executive-list-empty">Nenhum próximo passo</div>'}
              </div>
            </div>
          </div>

          <!-- COLUNA DIREITA -->
          <div class="executive-column">
            
            <!-- 5. PROGRESSO DO PROJETO -->
            <div class="executive-card executive-progress-card">
              <div class="executive-card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                Progresso do Projeto
              </div>
              <div class="executive-bars">
                <div class="executive-bar-item">
                  <div class="executive-bar-header">
                    <span>Concluído</span>
                    <span class="executive-bar-count done">${totals.done} (${donePercent}%)</span>
                  </div>
                  <div class="executive-bar-track">
                    <div class="executive-bar-fill done" style="width: ${donePercent}%"></div>
                  </div>
                </div>
                <div class="executive-bar-item">
                  <div class="executive-bar-header">
                    <span>Em Progresso</span>
                    <span class="executive-bar-count progress">${totals.inProgress} (${progressBarPercent}%)</span>
                  </div>
                  <div class="executive-bar-track">
                    <div class="executive-bar-fill progress" style="width: ${progressBarPercent}%"></div>
                  </div>
                </div>
                <div class="executive-bar-item">
                  <div class="executive-bar-header">
                    <span>Bloqueado</span>
                    <span class="executive-bar-count blocked">${totals.blocked} (${blockedBarPercent}%)</span>
                  </div>
                  <div class="executive-bar-track">
                    <div class="executive-bar-fill blocked" style="width: ${blockedBarPercent}%"></div>
                  </div>
                </div>
                <div class="executive-bar-item">
                  <div class="executive-bar-header">
                    <span>Outros</span>
                    <span class="executive-bar-count">${totals.issues - totals.done - totals.inProgress - totals.blocked} (${otherPercent}%)</span>
                  </div>
                  <div class="executive-bar-track">
                    <div class="executive-bar-fill other" style="width: ${otherPercent}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 6. TIME DO PROJETO -->
            <div class="executive-card executive-team-card">
              <div class="executive-card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                Time do Projeto
              </div>
              <div class="executive-team-grid">
                ${team.length > 0 ? team.map(t => `
                  <div class="executive-team-item">
                    <img src="${t.avatar || ''}" class="executive-team-avatar" alt="${t.name}">
                    <div class="executive-team-info">
                      <div class="executive-team-name" title="${t.name}">${t.name}</div>
                      <div class="executive-team-tickets">${t.totalTickets} tickets</div>
                    </div>
                  </div>
                `).join('') : '<div class="executive-list-empty">Nenhum membro</div>'}
              </div>
            </div>

            <!-- 7. RISCOS IDENTIFICADOS -->
            <div class="executive-card executive-risks-card">
              <div class="executive-card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Riscos Identificados
              </div>
              <div class="executive-risks-content">
                ${risks.length > 0 ? risks.map(r => `
                  <div class="executive-risk-item risk-${r.level.toLowerCase()}">
                    <span class="executive-risk-badge ${r.level.toLowerCase()}">${r.level}</span>
                    <div class="executive-risk-body">
                      <span class="executive-risk-title" title="${r.title}">${r.key} — ${r.title}</span>
                      <span class="executive-risk-meta">${r.reason} • Resp: ${r.assignee}</span>
                    </div>
                  </div>
                `).join('') : '<div class="executive-list-empty success">Nenhum risco identificado</div>'}
              </div>
            </div>
          </div>
        </div>

        </div>

      </div>
    </div>
  `;
}