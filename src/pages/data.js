/**
 * data.js — Página de configuração e sincronização do Jira
 */
import { dataService } from '../data/data-service.js';
import { formatDateTime, sanitize, sanitizeTitle } from '../utils/helpers.js';

let syncStatus = null;
let config = null;
let testResult = null;
let canEdit = true; // default true

export function renderData() {
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Configuração do Jira</h2>
      <div class="subtitle">Conecte, configure e sincronize os dados do Jira</div>
    </div>
  `;

  loadInitialData();
}

async function loadInitialData() {
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  
  try {
    // Carregar configuração
    config = await dataService.loadConfig();
    
    // Carregar status de sincronização
    syncStatus = await dataService.getSyncStatus();
    
    renderDataContent();
  } catch (error) {
    renderDataContent();
  }
}

function renderDataContent() {
  const content = document.getElementById('page-content');
  
  const isConfigured = config?.isConfigured || false;
  const lastSync = syncStatus?.lastSync || null;
  const lastSyncStatus = syncStatus?.lastSyncStatus || null;
  const lastSyncError = syncStatus?.lastSyncError || null;
  const rawData = dataService.getRawJiraData();
  
  // Detectar modo de produção
  const isProduction = config?.isProduction || false;
  canEdit = config?.canEdit !== false; // default true
  const source = config?.source || 'none';
  
  // Mensagem de acordo com o source
  let configMessage = '';
  if (source === 'env' || isProduction) {
    configMessage = '<div class="alert-item" style="background: var(--bg-secondary); border-left: 3px solid var(--accent); margin-bottom: 16px;"><div class="alert-text">⚙ Configuração Jira carregada via variáveis de ambiente. Altere-as no painel da Vercel.</div></div>';
  } else if (source === 'missing') {
    configMessage = '<div class="alert-item warning" style="margin-bottom: 16px;"><div class="alert-text">⚠ Jira não configurado no ambiente de produção. Configure JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN e JIRA_JQL no painel da Vercel.</div></div>';
  }
  
  content.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      
      <!-- Status Cards -->
      <div class="kpi-grid" style="margin-bottom: 24px;">
        <div class="kpi-card">
          <div class="kpi-label">Status da Conexão</div>
          <div class="kpi-value" style="font-size: 18px;">
            ${isConfigured 
              ? '<span style="color: var(--success);">✓ Configurado</span>' 
              : '<span style="color: var(--warning);">⚠ Não configurado</span>'}
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Última Sincronização</div>
          <div class="kpi-value" style="font-size: 16px;">
            ${lastSync ? formatDateTime(lastSync) : 'Nunca'}
          </div>
          ${lastSyncStatus === 'running' ? '<div style="color: var(--info); font-size: 12px;">Sincronizando...</div>' : ''}
          ${lastSyncStatus === 'error' ? `<div style="color: var(--danger); font-size: 11px;">${sanitize(lastSyncError || '')}</div>` : ''}
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total de Tickets</div>
          <div class="kpi-value">${rawData?.totalIssues || 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Projetos</div>
          <div class="kpi-value">${rawData?.totalProjects || 0}</div>
        </div>
      </div>

      <!-- Mensagem de configuração -->
      ${configMessage}

      <!-- Formulário de Configuração -->
      <div class="data-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Configuração do Jira
        </h3>
        
        <div class="form-group">
          <label>Jira Base URL *</label>
          <input type="text" id="jira-base-url" placeholder="https://empresa.atlassian.net" value="${sanitize(config?.baseUrl || '')}" ${!canEdit ? 'disabled' : ''}>
        </div>
        
        <div class="form-group">
          <label>Jira Email *</label>
          <input type="email" id="jira-email" placeholder="seu-email@empresa.com" value="${sanitize(config?.email || '')}" ${!canEdit ? 'disabled' : ''}>
        </div>
        
        <div class="form-group">
          <label>API Token *</label>
          <div style="position: relative;">
            <input type="password" id="jira-token" placeholder="${canEdit ? 'Cole seu API Token aqui' : 'Token configurado via ambiente'}" ${!canEdit ? 'disabled' : ''}>
            ${config?.tokenMasked ? `<div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--text-muted);">${config.tokenMasked}</div>` : ''}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            Gere seu token em: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" style="color: var(--accent);">Atlassian Account Settings</a>
          </div>
        </div>
        
        <div class="form-group">
          <label>JQL (Filtro)</label>
          <textarea id="jira-jql" rows="3" style="font-family: monospace; font-size: 12px;" ${!canEdit ? 'readonly' : ''}>${sanitize(config?.jql || 'project in (...) AND status is not EMPTY ORDER BY ...')}</textarea>
        </div>
        
        <div class="form-group">
          <label>Cache TTL (minutos)</label>
          <input type="number" id="jira-cache-ttl" min="1" max="60" value="${config?.cacheTtlMinutes || 10}" style="width: 120px;" ${!canEdit ? 'disabled' : ''}>
        </div>
        
        <!-- Resultado do Teste -->
        ${testResult ? `
          <div class="alert-item ${testResult.success ? '' : 'warning'}" style="margin-bottom: 16px;">
            <div class="alert-text">
              ${testResult.success 
                ? `<strong>✓ Conexão OK!</strong> Usuário: ${sanitize(testResult.user?.displayName || '')} (${sanitize(testResult.user?.email || '')}). Tickets encontrados: ${testResult.totalTickets}`
                : `<strong>✗ Erro:</strong> ${sanitize(testResult.error || '')}`
              }
            </div>
          </div>
        ` : ''}
        
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px;">
          <button class="btn btn-secondary" id="btn-test-connection">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Testar Conexão
          </button>
          ${canEdit ? `
          <button class="btn btn-primary" id="btn-save-config">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Salvar Configuração
          </button>
          ` : ''}
        </div>
      </div>

      <!-- Ações de Sincronização -->
      <div class="data-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Sincronização
        </h3>
        
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
          <button class="btn btn-primary" id="btn-sync-now" ${!isConfigured ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            ${rawData ? 'Atualizar Dados' : 'Sincronizar Agora'}
          </button>
          <button class="btn btn-secondary" id="btn-clear-cache" ${!isConfigured ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Limpar Cache
          </button>
        </div>

        <!-- Preview dos Dados -->
        ${rawData && rawData.issues ? `
          <div style="margin-top: 24px;">
            <h4 style="margin-bottom: 12px; font-size: 14px;">Preview (primeiros 5 tickets)</h4>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Título</th>
                    <th>Projeto</th>
                    <th>Status</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  ${rawData.issues.slice(0, 5).map(issue => `
                    <tr>
                      <td style="font-weight: 600; color: var(--accent);">${sanitize(issue.key || '')}</td>
                      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitize(issue.title || '')}</td>
                      <td>${sanitize(issue.project.key || '')}</td>
                      <td><span class="badge badge-progress">${sanitize(issue.status.name || '')}</span></td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                          ${issue.assignee?.avatar ? `<img src="${sanitizeTitle(issue.assignee.avatar)}" class="avatar avatar-sm" onerror="this.style.display='none'">` : ''}
                          <span>${sanitize(issue.assignee?.name || '—')}</span>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Resumo dos Dados Coletados -->
      ${rawData ? `
        <div class="data-section">
          <h3>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            Dados Coletados
          </h3>
          
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
            <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
              <div style="font-size: 28px; font-weight: 700; color: var(--accent);">${rawData.totalIssues}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Total Tickets</div>
            </div>
            <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
              <div style="font-size: 28px; font-weight: 700; color: var(--success);">${rawData.totalProjects}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Projetos</div>
            </div>
            <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
              <div style="font-size: 28px; font-weight: 700; color: var(--warning);">${rawData.totalAnalysts}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Analistas</div>
            </div>
            <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
              <div style="font-size: 28px; font-weight: 700; color: var(--info);">${rawData.statuses?.length || 0}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Status</div>
            </div>
          </div>

          <!-- Lista de Projetos -->
          <div style="margin-top: 16px;">
            <h4 style="font-size: 14px; margin-bottom: 12px;">Projetos</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${rawData.projects.map(p => `
                <span class="badge badge-type">${sanitize(p.key || '')} (${p.totalTickets})</span>
              `).join('')}
            </div>
          </div>

          <!-- Lista de Analistas -->
          <div style="margin-top: 16px;">
            <h4 style="font-size: 14px; margin-bottom: 12px;">Analistas</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              ${rawData.analysts.map(a => `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
                  ${a.avatar ? `<img src="${sanitizeTitle(a.avatar)}" class="avatar avatar-sm" onerror="this.style.display='none'">` : `<div class="avatar avatar-sm" style="background: var(--accent); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px;">${sanitize(a.name || '?').charAt(0)}</div>`}
                  <div>
                    <div style="font-size: 13px; font-weight: 500;">${sanitize(a.name || '')}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${a.totalTickets} tickets</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  // Testar conexão
  document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-connection');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Testando...';
    
    try {
      const configData = getFormData();
      testResult = await dataService.testConnection(configData);
      renderDataContent();
    } catch (error) {
      testResult = { success: false, error: error.message };
      renderDataContent();
    }
  });

  // Salvar configuração - apenas se pode editar
  if (canEdit) {
    document.getElementById('btn-save-config')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-save-config');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Salvando...';
      
      try {
        const configData = getFormData();
        await dataService.saveConfig(configData);
        config = await dataService.loadConfig();
        syncStatus = await dataService.getSyncStatus();
        
        alert('Configuração salva com sucesso!');
        renderDataContent();
      } catch (error) {
        alert('Erro ao salvar: ' + error.message);
        renderDataContent();
      }
});
  }

  // Sincronizar
  document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-now');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Sincronizando...';
    
    try {
      const result = await dataService.syncFromJira();
      syncStatus = await dataService.getSyncStatus();
      
      alert(`Sincronização concluída!\n\nTickets: ${result.totalIssues}\nProjetos: ${result.totalProjects}\nAnalistas: ${result.totalAnalysts}`);
      
      // Recarregar página para atualizar dashboard
      window.location.reload();
    } catch (error) {
      alert('Erro ao sincronizar: ' + error.message);
      syncStatus = await dataService.getSyncStatus();
      renderDataContent();
    }
  });

  // Limpar cache
  document.getElementById('btn-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja limpar o cache?')) return;
    
    try {
      await dataService.clearCache();
      alert('Cache limpo com sucesso!');
      renderDataContent();
    } catch (error) {
      alert('Erro ao limpar cache: ' + error.message);
    }
  });
}

function getFormData() {
  return {
    baseUrl: document.getElementById('jira-base-url')?.value?.trim() || '',
    email: document.getElementById('jira-email')?.value?.trim() || '',
    token: document.getElementById('jira-token')?.value?.trim() || '',
    jql: document.getElementById('jira-jql')?.value?.trim() || '',
    cacheTtlMinutes: parseInt(document.getElementById('jira-cache-ttl')?.value, 10) || 10
  };
}