/**
 * data.js - Tela simples para iniciar e acompanhar sync Jira no backend.
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
      detail: 'Preencha os dados do Jira e inicie uma nova importacao.'
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
    title: 'Erro na sincronização.',
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
        <div class="sync-form-grid">
          <div class="form-group">
            <label for="jira-base-url">Base URL</label>
            <input type="text" id="jira-base-url" placeholder="https://empresa.atlassian.net" ${isProcessing ? 'disabled' : ''}>
          </div>

          <div class="form-group">
            <label for="jira-email">E-mail</label>
            <input type="email" id="jira-email" placeholder="seu-email@empresa.com" autocomplete="email" ${isProcessing ? 'disabled' : ''}>
          </div>

          <div class="form-group">
            <div class="sync-token-label">
              <label for="jira-token">API Token</label>
              <a
                class="btn btn-secondary sync-token-link"
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                Criar API Token
              </a>
            </div>
            <input type="password" id="jira-token" placeholder="Cole seu API Token" autocomplete="off" ${isProcessing ? 'disabled' : ''}>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-start-sync" ${isProcessing ? 'disabled' : ''}>
          ${isProcessing ? '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Sincronizando...' : 'Iniciar sincronização'}
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
    const credentials = getFormData();

    if (!credentials.baseUrl || !credentials.email || !credentials.token) {
      syncStatus = {
        status: 'error',
        error: 'Preencha Base URL, E-mail e API Token para iniciar a sincronizacao.',
        logs: []
      };
      renderDataContent();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Iniciando...';

    try {
      const result = await dataService.startJiraSync(credentials);
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

function getFormData() {
  let baseUrl = document.getElementById('jira-base-url')?.value?.trim() || '';
  if (baseUrl && !baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/\/$/, '').toLowerCase();

  return {
    baseUrl,
    email: document.getElementById('jira-email')?.value?.trim() || '',
    token: document.getElementById('jira-token')?.value?.trim() || ''
  };
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

    .sync-form-grid {
      display: grid;
      gap: 18px;
      margin-bottom: 24px;
    }

    .sync-panel .btn {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }

    .sync-token-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }

    .sync-token-label label {
      margin: 0;
    }

    .sync-token-link {
      width: auto !important;
      min-height: 32px !important;
      padding: 6px 10px;
      font-size: 12px;
      white-space: nowrap;
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
