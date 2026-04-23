/**
 * data.js — Página de configuração de origem de dados
 */
import { dataService } from '../data/data-service.js';
import { formatDateTime } from '../utils/helpers.js';

export function renderData() {
  const header = document.getElementById('page-header');
  header.innerHTML = `
    <div>
      <h2>Configurações de Dados</h2>
      <div class="subtitle">Gerencie a conexão com o Jira ou importe dados manuais</div>
    </div>
  `;

  renderDataContent();
}

function renderDataContent() {
  const content = document.getElementById('page-content');
  const source = dataService.source;
  const lastSync = dataService.lastSync;

  content.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto;">
      
      <div class="data-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
          Status da Sincronização
        </h3>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">Fonte Atual</div>
            <div class="badge badge-${source === 'mock' ? 'todo' : source === 'api' ? 'done' : 'progress'}" style="font-size: 14px; padding: 6px 12px;">
              ${source === 'mock' ? 'Dados Simulados (Mock)' : source === 'api' ? 'Jira Cloud API' : 'Dados Importados'}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;">Última Atualização</div>
            <div style="font-weight: 600;">${formatDateTime(lastSync)}</div>
          </div>
        </div>
        <div style="margin-top: 24px; display: flex; gap: 12px;">
          <button class="btn btn-primary" id="btn-sync-now">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Sincronizar Agora
          </button>
          <button class="btn btn-secondary" id="btn-reset-mock">Voltar para Mock</button>
        </div>
      </div>

      <div class="data-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
          Conexão API Jira Cloud
        </h3>
        <div class="alert-item warning" style="margin-bottom: 20px;">
          <div class="alert-text">A integração via API requer um domínio Jira válido e um Token de API configurado.</div>
        </div>
        
        <div class="form-group">
          <label>URL da Instância</label>
          <input type="text" placeholder="ex: sua-empresa.atlassian.net" id="jira-url">
        </div>
        <div class="form-group">
          <label>Email da Conta</label>
          <input type="email" placeholder="seu-email@empresa.com" id="jira-email">
        </div>
        <div class="form-group">
          <label>API Token</label>
          <input type="password" placeholder="••••••••••••••••" id="jira-token">
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px;">
          <button class="btn btn-secondary" disabled>Testar Conexão</button>
          <button class="btn btn-primary" disabled>Salvar e Conectar</button>
        </div>
      </div>

      <div class="data-section">
        <h3>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          Importação Manual
        </h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
          Carregue um arquivo JSON ou CSV exportado do Jira. O sistema validará a estrutura para garantir que todos os cards pertençam a um projeto.
        </p>
        
        <div class="upload-area" id="upload-zone">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
          <p>Clique ou arraste o arquivo para importar</p>
          <div class="formats">Suporta .json, .csv (Estrutura Jira Padrão)</div>
        </div>
      </div>

    </div>
  `;

  // Listeners
  document.getElementById('btn-reset-mock').addEventListener('click', () => {
    dataService.loadMockData();
    renderDataContent();
    alert('Dados resetados para o modo Mock com sucesso.');
  });

  document.getElementById('btn-sync-now').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Sincronizando...';
    btn.disabled = true;
    
    setTimeout(() => {
      dataService.loadMockData(); // Simula sync
      renderDataContent();
    }, 1500);
  });
}
