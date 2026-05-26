/**
 * data.js - Tela simples para iniciar e acompanhar sync Jira no backend.
 *
 * As credenciais do Jira sao lidas de variaveis de ambiente no servidor.
 * O frontend nunca recebe ou envia credenciais.
 */
import { dataService } from '../data/data-service.js';
import { renderSidebar } from '../components/sidebar.js';
import { sanitize } from '../utils/helpers.js';

let syncStatus = null;
let pollingInterval = null;

export function renderData() {
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Importacao de Dados</h2>
      <div class="subtitle">Sincronizacao Jira executada pelo back-end</div>
    </div>
  `;

  loadInitialStatus();
}

async function loadInitialStatus() {
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const savedJobId = sessionStorage.getItem('activeSyncJobId');
  syncStatus = await dataService.getSyncStatus(savedJobId).catch(() => null);
  await dataService.ensureLoaded({ force: true }).then(() => renderSidebar()).catch(() => null);

  if (syncStatus?.id && ['queued', 'running'].includes(syncStatus.status)) {
    sessionStorage.setItem('activeSyncJobId', syncStatus.id);
    startPolling(syncStatus.id);
  }

  renderDataContent();
}

function startPolling(jobId) {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      syncStatus = await dataService.getSyncStatus(jobId);

      if (!syncStatus || !['queued', 'running'].includes(syncStatus.status)) {
        clearInterval(pollingInterval);
        pollingInterval = null;

        if (syncStatus?.status === 'success') {
          sessionStorage.removeItem('activeSyncJobId');
          await dataService.loadJiraData();
        }
      }

      if (window.location.hash.startsWith('#/data')) {
        renderDataContent();
      }
    } catch (error) {
      syncStatus = {
        status: 'error',
        error: error.message,
        logs: []
      };
      renderDataContent();
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }, 3000);
}

function getStatusMessage() {
  if (!syncStatus || syncStatus.status === 'idle') {
    return {
      className: 'sync-status-idle',
      title: 'Aguardando sincronizacao.',
      detail: 'Clique em "Iniciar sincronizacao" para importar os tickets do Jira.'
    };
  }

  if (syncStatus.status === 'queued') {
    return {
      className: 'sync-status-running',
      title: 'Sincronizacao aguardando processamento.',
      detail: 'O job ja foi criado no back-end.'
    };
  }

  if (syncStatus.status === 'running') {
    return {
      className: 'sync-status-running',
      title: 'Sincronizando dados no back-end...',
      detail: 'Voce pode fechar esta aba; o processo continuara no servidor.'
    };
  }

  if (syncStatus.status === 'success') {
    return {
      className: 'sync-status-success',
      title: 'Tickets sincronizados com sucesso.',
      detail: `${syncStatus.totalIssues || 0} tickets processados.`
    };
  }

  return {
    className: 'sync-status-error',
    title: 'Erro na sincronizacao.',
    detail: syncStatus.error || 'Erro desconhecido durante a sincronizacao.'
  };
}

function renderDataContent() {
  const content = document.getElementById('page-content');
  const status = getStatusMessage();
  const isProcessing = ['queued', 'running'].includes(syncStatus?.status);
  const logs = Array.isArray(syncStatus?.logs) ? syncStatus.logs.slice(-6) : [];
  const metadata = dataService.getSyncMetadata();
  const lastSyncLabel = metadata.lastSyncedAt
    ? new Date(metadata.lastSyncedAt).toLocaleString('pt-BR')
    : 'Nunca';

  content.innerHTML = `
    <div class="sync-page">
      <section class="sync-panel">
        <div class="sync-panel-info">
          <div class="sync-panel-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </div>
          <div>
            <strong>Sincronizacao gerenciada pelo servidor</strong>
            <p>As credenciais do Jira estao configuradas no backend via variaveis de ambiente.</p>
            <p>Nao e necessario preencher nenhum dado no navegador.</p>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-start-sync" ${isProcessing ? 'disabled' : ''}>
          ${isProcessing
            ? '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Sincronizando...'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Iniciar sincronizacao'}
        </button>
      </section>

      <section class="sync-status ${status.className}">
        <div class="sync-status-header">
          ${isProcessing ? '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span>' : ''}
          <strong>${sanitize(status.title)}</strong>
        </div>
        <p>${sanitize(status.detail)}</p>
        <div class="sync-metrics">
          <div><span>Total no dashboard</span><strong>${sanitize(String(metadata.totalIssues || 0))}</strong></div>
          <div><span>Ultima sync</span><strong>${sanitize(lastSyncLabel)}</strong></div>
          <div><span>Status real</span><strong>${sanitize(metadata.lastSyncStatus || syncStatus?.status || 'idle')}</strong></div>
          <div><span>Inseridos / atualizados</span><strong>${sanitize(String(syncStatus?.inserted ?? metadata.inserted ?? 0))} / ${sanitize(String(syncStatus?.updated ?? metadata.updated ?? 0))}</strong></div>
        </div>
        ${syncStatus?.id ? `<div class="sync-job-id">Job: ${sanitize(syncStatus.id)}</div>` : ''}
        ${logs.length ? `
          <div class="sync-log-list">
            ${logs.map(log => `
              <div>
                <span>${sanitize(new Date(log.at).toLocaleTimeString())}</span>
                ${sanitize(log.message)}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </section>
    </div>
  `;

  addDataStyles();
  setupEventListeners();
}

function setupEventListeners() {
  document.getElementById('btn-start-sync')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-start-sync');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Iniciando...';

    try {
      // Chama endpoint que usa apenas env vars (sem enviar credenciais do frontend)
      const result = await dataService.startJiraSyncFromEnv();
      syncStatus = result.job || {
        id: result.jobId,
        status: 'queued',
        logs: []
      };

      if (result.jobId) {
        sessionStorage.setItem('activeSyncJobId', result.jobId);
        startPolling(result.jobId);
      }

      renderDataContent();
    } catch (error) {
      syncStatus = {
        status: 'error',
        error: error.message,
        logs: []
      };
      renderDataContent();
    }
  });
}

function addDataStyles() {
  if (document.getElementById('data-sync-styles')) return;

  const style = document.createElement('style');
  style.id = 'data-sync-styles';
  style.textContent = `
    .sync-page {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .sync-panel,
    .sync-status {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      padding: 24px;
    }

    .sync-panel-info {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .sync-panel-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border-radius: 10px;
      color: var(--accent);
    }

    .sync-panel-info strong {
      display: block;
      color: var(--text-primary);
      font-size: 14px;
      margin-bottom: 6px;
    }

    .sync-panel-info p {
      margin: 0 0 4px 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .sync-panel-info p:last-child {
      margin-bottom: 0;
    }

    .sync-panel .btn {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }

    .sync-status {
      border-left-width: 4px;
    }

    .sync-status-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .sync-status p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .sync-metrics {
      margin-top: 16px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .sync-metrics div {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      background: var(--bg-secondary);
    }

    .sync-metrics span {
      display: block;
      color: var(--text-muted);
      font-size: 11px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .sync-metrics strong {
      color: var(--text-primary);
      font-size: 14px;
    }

    .sync-status-idle { border-left-color: var(--border); }
    .sync-status-running { border-left-color: var(--accent); }
    .sync-status-success { border-left-color: var(--success); }
    .sync-status-error { border-left-color: var(--danger); }

    .sync-job-id {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .sync-log-list {
      margin-top: 16px;
      display: grid;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .sync-log-list div {
      display: flex;
      gap: 10px;
      align-items: baseline;
      border-top: 1px solid var(--border);
      padding-top: 8px;
    }

    .sync-log-list span {
      color: var(--text-muted);
      font-family: monospace;
      white-space: nowrap;
    }
  `;

  document.head.appendChild(style);
}
