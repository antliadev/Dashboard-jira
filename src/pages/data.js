/**
 * data.js — Página de configuração e sincronização do Jira
 */
import { dataService } from '../data/data-service.js';
import { formatDateTime, sanitize, sanitizeTitle } from '../utils/helpers.js';

let syncStatus = null;
let config = null;
let testResult = null;
let canEdit = true; // default true
let pollingInterval = null;

export function renderData() {
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Configuração Global</h2>
      <div class="subtitle">Gerencie as credenciais e sincronização para toda a equipe</div>
    </div>
  `;

  loadInitialData();
  
  // Iniciar polling para status de sincronização
  startStatusPolling();
}

/**
 * Polling para atualizar o status de sincronização globalmente
 */
function startStatusPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  
  pollingInterval = setInterval(async () => {
    try {
      const newStatus = await dataService.getSyncStatus();
      
      // Se o status mudou de 'running' para algo diferente, ou vice-versa, atualizamos a tela
      if (newStatus.lastSyncStatus !== syncStatus?.lastSyncStatus || 
          newStatus.lastSync !== syncStatus?.lastSync) {
        syncStatus = newStatus;
        
        // Atualizar logs no terminal se houver mudança relevante
        const log = (msg, color = '#888') => {
          const term = document.getElementById('terminal-log');
          if (term) {
            const div = document.createElement('div');
            div.style.color = color;
            div.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
            term.appendChild(div);
            term.scrollTop = term.scrollHeight;
          }
        };

        if (newStatus.lastSyncStatus === 'success') {
          log('EVENTO: Sincronização finalizada com sucesso no servidor.', '#00ff00');
        } else if (newStatus.lastSyncStatus === 'error') {
          log(`ERRO: Falha detectada no servidor: ${newStatus.lastSyncError || 'Desconhecido'}`, '#ef4444');
        }

        // Só atualiza o conteúdo se estivermos na página de dados
        if (window.location.hash.startsWith('#/data')) {
           // Se a sincronização acabou de terminar e foi sucesso, recarregamos dados do dashboard em background
           if (newStatus.lastSyncStatus === 'success') {
             await dataService.loadJiraData();
           }
           renderDataContent();
        }
      }
    } catch (e) {
      console.warn('[DataPage] Erro no polling de status:', e.message);
    }
  }, 15000); // A cada 15 segundos (otimizado para reduzir strain no servidor)
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
    configMessage = `
      <div class="alert-item" style="background: rgba(99,102,241,0.05); border: 1px solid var(--accent-border); border-left: 4px solid var(--accent); margin-bottom: 24px; padding: 16px;">
        <div style="display: flex; gap: 12px; align-items: center;">
          <div style="color: var(--accent);">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="alert-text">
            <strong style="color: var(--text-primary); display: block; margin-bottom: 2px;">Ambiente Compartilhado Ativo</strong>
            <span style="font-size: 13px; color: var(--text-secondary);">Esta instância utiliza uma "Single Source of Truth". Qualquer alteração nas credenciais ou sincronização reflete imediatamente para todos os usuários da equipe.</span>
          </div>
        </div>
      </div>
    `;
  }
  
  content.innerHTML = `
    <div style="max-width: 1000px; margin: 0 auto;">
      
      <!-- Status Cards -->
      <div class="kpi-grid" style="margin-bottom: 24px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="kpi-card" style="border-bottom: 3px solid ${isConfigured ? 'var(--success)' : 'var(--warning)'}">
          <div class="kpi-label">Conexão Jira</div>
          <div class="kpi-value" style="font-size: 18px; display: flex; align-items: center; gap: 8px;">
            ${isConfigured 
              ? `<span style="color: var(--success);">● Ativa</span>` 
              : `<span style="color: var(--warning);">● Pendente</span>`}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Modo: ${isProduction ? 'Produção (Global)' : 'Desenvolvimento'}</div>
        </div>
        
        <div class="kpi-card" style="border-bottom: 3px solid ${lastSyncStatus === 'running' ? 'var(--info)' : 'var(--accent)'}">
          <div class="kpi-label">Última Sincronização</div>
          <div class="kpi-value" style="font-size: 16px;">
            ${lastSync ? formatDateTime(lastSync) : 'Nunca'}
          </div>
          <div style="margin-top: 4px;">
            ${lastSyncStatus === 'running' 
              ? `
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge badge-progress" style="animation: pulse-badge 1.5s infinite;">Sincronizando agora...</span>
                  <button id="btn-force-reset" title="Forçar interrupção se estiver travado" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px; display: flex; align-items: center; opacity: 0.7;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  </button>
                </div>
              `
              : lastSyncStatus === 'error'
                ? `<span class="badge badge-blocked" title="${sanitize(lastSyncError || '')}">Erro na última carga</span>`
                : '<span class="badge badge-done">Dados atualizados</span>'
            }
          </div>
        </div>
        
        <div class="kpi-card">
          <div class="kpi-label">Base de Dados</div>
          <div class="kpi-value">${rawData?.totalIssues || 0}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Tickets armazenados no Supabase</div>
        </div>
        
        <div class="kpi-card">
          <div class="kpi-label">Ecossistema</div>
          <div class="kpi-value">${rawData?.totalProjects || 0} <span style="font-size: 12px; font-weight: 400; color: var(--text-muted);">projetos</span></div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${rawData?.totalAnalysts || 0} analistas identificados</div>
        </div>
      </div>

      ${configMessage}

      <div style="display: grid; grid-template-columns: 1fr 320px; gap: 24px; align-items: start;">
        
        <!-- COLUNA ESQUERDA: CONFIG -->
        <div>
          <div class="data-section" style="margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <h3 style="margin: 0;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                Parâmetros de Conexão
              </h3>
              ${isProduction ? '<span class="badge" style="background: rgba(99,102,241,0.1); color: var(--accent);">READ-ONLY (Vercel)</span>' : ''}
            </div>
            
            <div class="form-group">
              <label>Jira Base URL *</label>
              <input type="text" id="jira-base-url" placeholder="https://empresa.atlassian.net" value="${sanitize(config?.baseUrl || '')}" ${!canEdit ? 'disabled' : ''}>
            </div>
            
            <div class="form-group">
              <label>Jira Email *</label>
              <input type="email" id="jira-email" placeholder="seu-email@empresa.com" value="" ${!canEdit ? 'disabled' : ''}>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Por segurança, preencha seu e-mail para validar ou sincronizar.</div>
            </div>
            
            <div class="form-group">
              <label style="display: flex; justify-content: space-between;">
                API Token *
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" style="font-size: 11px; color: var(--accent); text-decoration: none;">Gerar Token ↗</a>
              </label>
              <div style="position: relative;">
                <input type="text" id="jira-token" placeholder="${canEdit ? 'Cole seu API Token aqui' : 'Token criptografado no banco'}" ${!canEdit ? 'disabled' : ''} style="font-family: monospace; font-size: 11px;">
                ${config?.tokenMasked ? `<div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--text-muted); font-family: monospace;">${config.tokenMasked}</div>` : ''}
              </div>
            </div>
            
            <input type="hidden" id="jira-jql" value="${sanitize(config?.jql || '')}">

            <div style="display: flex; gap: 12px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
              <button class="btn btn-secondary" id="btn-test-connection" style="flex: 1;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Validar Acesso
              </button>
            </div>
          </div>

          <!-- Preview dos Dados -->
          ${rawData && rawData.issues ? `
            <div class="data-section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0;">Snapshot da Base</h3>
                <span style="font-size: 11px; color: var(--text-muted);">Amostra de 5 de ${rawData.totalIssues} tickets</span>
              </div>
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Chave</th>
                      <th>Título</th>
                      <th>Projeto</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rawData.issues.slice(0, 5).map(issue => `
                      <tr>
                        <td style="font-weight: 700; color: var(--accent);">${sanitize(issue.key || '')}</td>
                        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitize(issue.title || '')}</td>
                        <td><span class="badge badge-type">${sanitize(issue.project.key || '')}</span></td>
                        <td><span class="badge badge-progress">${sanitize(issue.status.name || '')}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- COLUNA DIREITA: SYNC & LOGS -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          
          <div class="data-section" style="background: linear-gradient(to bottom, var(--bg-card), var(--bg-secondary));">
            <h3>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              Sincronização
            </h3>
            <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
              A sincronização busca todos os tickets do Jira e atualiza a base central no Supabase para toda a equipe.
            </p>
            
            <button class="btn btn-primary" id="btn-sync-now" style="width: 100%; justify-content: center; padding: 12px;" ${!isConfigured || lastSyncStatus === 'running' ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="${lastSyncStatus === 'running' ? 'spinner' : ''}"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              ${lastSyncStatus === 'running' ? 'Processando...' : 'Sincronizar Global'}
            </button>

            <button class="btn btn-secondary" id="btn-clear-cache" style="width: 100%; justify-content: center; margin-top: 12px;" ${!isConfigured ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              Limpar Cache API
            </button>
          </div>

          <div class="data-section" style="background: #000; border-color: #333;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="margin: 0; font-family: monospace; color: #00ff00; font-size: 13px;">Terminal.log</h3>
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #00ff00; box-shadow: 0 0 5px #00ff00;"></span>
            </div>
            <div id="terminal-log" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #888; height: 180px; overflow-y: auto; line-height: 1.6;">
              <div>[${new Date().toLocaleTimeString()}] Sistema de monitoramento ativo.</div>
              ${lastSync ? `<div>[${new Date(lastSync).toLocaleTimeString()}] Último evento: ${lastSyncStatus === 'success' ? 'SYNC_COMPLETE' : 'SYNC_FAILED'}</div>` : ''}
              ${lastSyncStatus === 'running' ? '<div style="color: #00ff00;">[SYNC] Sincronização em andamento no servidor...</div>' : ''}
              <div>[DATABASE] Conectado ao Supabase Cluster.</div>
              <div style="color: #555;">> Aguardando comando...</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Se houver um resultado de teste, mostrar em um modal ou alerta
  if (testResult) {
    if (testResult.success) {
      const validatedWith = testResult.validatedWith === 'saved' 
        ? '\n\n(Validadas credenciais salvas no Supabase)' 
        : '\n\n(Validadas credenciais do formulário)';
      alert(`Conexão OK!${validatedWith}\nUsuário: ${testResult.user?.displayName}\nTickets encontrados: ${testResult.testResult?.totalTickets}`);
    } else {
      alert(`Erro na Conexão: ${testResult.error}`);
    }
    testResult = null; // Limpar após mostrar
  }

  setupEventListeners();
}

function setupEventListeners() {
  // Testar conexão
  document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-connection');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Validando...';
    
    try {
      const configData = getFormData();
      
      // Validação obrigatória
      if (!configData.baseUrl || !configData.email || !configData.token) {
        testResult = { success: false, error: 'Preencha URL, Email e Token para validar a conexão.' };
        renderDataContent();
        return;
      }
      
      console.log('[DataPage] Validando credenciais do formulário...');
      
      testResult = await dataService.testJiraConnection(configData);
      
      // Adicionar informação sobre o que foi validado
      if (testResult.success) {
        testResult.validatedWith = 'form';
      }
      
      renderDataContent();
    } catch (error) {
      testResult = { success: false, error: error.message };
      renderDataContent();
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  });



  // Sincronizar Global
  document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
    if (syncStatus?.lastSyncStatus === 'running') return;
    
    const btn = document.getElementById('btn-sync-now');
    const originalContent = btn.innerHTML;
    const log = (msg, color = '#888') => {
      const term = document.getElementById('terminal-log');
      if (term) {
        const div = document.createElement('div');
        div.style.color = color;
        div.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
        term.appendChild(div);
        term.scrollTop = term.scrollHeight;
      }
    };

    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="spinner"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Sincronizando...';
    
    log('Iniciando processo de sincronização global...', '#00ff00');
    
    try {
      const configData = getFormData();
      
      // Validação obrigatória
      if (!configData.baseUrl || !configData.email || !configData.token) {
        alert('Preencha URL, Email e Token para realizar a sincronização!');
        btn.disabled = false;
        btn.innerHTML = originalContent;
        return;
      }

      // Iniciar sincronização enviando as credenciais no body
      log('Solicitando carga de dados ao Jira (isso pode levar até 60s)...', '#00ff00');
      
      const syncPromise = dataService.syncFromJira(configData);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tempo limite excedido. A sincronização continuará rodando no servidor.')), 55000)
      );

      let result;
      try {
        result = await Promise.race([syncPromise, timeoutPromise]);
        log(`Sincronização concluída: ${result.totalIssues} tickets processados.`, '#00ff00');
      } catch (error) {
        if (error.message.includes('Tempo limite')) {
          log('Sincronização ainda em andamento no servidor...', '#facc15');
        } else {
          throw error; // Re-lança erros reais
        }
      }
      
      // Atualizar status local e UI
      syncStatus = await dataService.getSyncStatus();
      alert(`Dados sincronizados para todos!`);
      
      // 5. Recarregar dados para o dashboard
      log('Recarregando cache local...');
      await dataService.loadJiraData();
      renderDataContent();
    } catch (error) {
      log(`ERRO: ${error.message}`, '#ef4444');
      
      // Forçar reset do status local para desbloquear o botão
      syncStatus = { lastSyncStatus: 'error', lastSyncError: error.message };
      
      alert('Erro na sincronização: ' + error.message);
      
      renderDataContent();
    } finally {
      // Sempre restaurar o botão, independente de sucesso ou erro
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  });

  // Limpar cache
  document.getElementById('btn-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Deseja limpar o cache de API do servidor?')) return;
    
    try {
      await dataService.clearCache();
      alert('Cache do servidor limpo!');
      renderDataContent();
    } catch (error) {
      alert('Erro ao limpar cache: ' + error.message);
    }
  });

  // Forçar reset de sincronização
  document.getElementById('btn-force-reset')?.addEventListener('click', async () => {
    if (!confirm('Deseja interromper o status de sincronização? Use apenas se achar que o processo travou.')) return;
    
    try {
      // Chamamos uma API para limpar o cache/status
      await dataService.clearCache();
      syncStatus = await dataService.getSyncStatus();
      alert('Status de sincronização resetado com sucesso.');
      renderDataContent();
    } catch (error) {
      alert('Erro ao resetar: ' + error.message);
    }
  });
}

function getFormData() {
  return {
    baseUrl: document.getElementById('jira-base-url')?.value?.trim() || '',
    email: document.getElementById('jira-email')?.value?.trim() || '',
    token: document.getElementById('jira-token')?.value?.trim() || '',
    jql: document.getElementById('jira-jql')?.value?.trim() || '',
    cacheTtlMinutes: 10 // Padrão
  };
}