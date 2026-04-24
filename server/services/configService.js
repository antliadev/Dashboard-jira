/**
 * configService.js — Serviço de configuração segura do Jira
 * 
 * Gerencia configurações do Jira de forma segura.
 * O token é armazenado apenas em memória no backend, nunca exposto.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '../../jira-config.json');

const DEFAULT_CONFIG = {
  baseUrl: '',
  email: '',
  jql: 'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY project ASC, status ASC, assignee ASC, updated DESC',
  cacheTtlMinutes: 10,
  lastSync: null,
  lastSyncStatus: null,
  lastSyncError: null
};

class ConfigService {
  constructor() {
    this._config = null;
    this._loadConfig();
  }

  _loadConfig() {
    // 1) Carrega variáveis de ambiente em produção ou desenvolvimento
    const envBaseUrl = process.env.JIRA_BASE_URL;
    const envEmail = process.env.JIRA_EMAIL;
    const envToken = process.env.JIRA_API_TOKEN;
    const envJql = process.env.JIRA_JQL;
    const envCacheTtl = process.env.JIRA_CACHE_TTL;

    // 2) Carrega configuração de arquivo (jira-config.json) se existente
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this._config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      } else {
        this._config = { ...DEFAULT_CONFIG };
      }
    } catch (error) {
      console.error('[ConfigService] Erro ao carregar configuração:', error.message);
      this._config = { ...DEFAULT_CONFIG };
    }

    // 3) Aplicar variáveis de ambiente por cima (prioridade maior)
    if (envBaseUrl) this._config.baseUrl = envBaseUrl.replace(/\/$/, '');
    if (envEmail) this._config.email = envEmail;
    if (envToken) this._config.token = envToken;
    if (envJql) this._config.jql = envJql;
    if (envCacheTtl) this._config.cacheTtlMinutes = parseInt(envCacheTtl, 10);

    // 4) Determinar origem da configuração
    this._config.source = envBaseUrl ? 'env' : (this._config.baseUrl ? 'file' : 'none');
    // Garantir consistência caso o env já tenha vindo, mas token não esteja presente
    if (this._config.source === 'env' && !this._config.baseUrl) {
      this._config.source = 'none';
    }
  }

  _saveConfig() {
    try {
      // Não salvar o token em arquivo
      const configToSave = {
        baseUrl: this._config.baseUrl,
        email: this._config.email,
        jql: this._config.jql,
        cacheTtlMinutes: this._config.cacheTtlMinutes,
        lastSync: this._config.lastSync,
        lastSyncStatus: this._config.lastSyncStatus,
        lastSyncError: this._config.lastSyncError
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      console.error('[ConfigService] Erro ao salvar configuração:', error.message);
    }
  }

  getConfig(includeToken = false) {
    if (!this._config) {
      this._loadConfig();
    }
    
    return {
      baseUrl: this._config.baseUrl,
      email: this._config.email,
      jql: this._config.jql,
      cacheTtlMinutes: this._config.cacheTtlMinutes,
      hasToken: !!this._config.token,
      tokenMasked: this._config.token ? '********' + this._config.token.slice(-4) : null,
      source: this._config.source,
      lastSync: this._config.lastSync,
      lastSyncStatus: this._config.lastSyncStatus,
      lastSyncError: this._config.lastSyncError,
      isConfigured: !!(this._config.baseUrl && this._config.email && this._config.token)
    };
  }

  setConfig({ baseUrl, email, token, jql, cacheTtlMinutes }) {
    if (baseUrl) {
      if (!baseUrl.startsWith('https://')) {
        throw new Error('URL deve começar com https://');
      }
      this._config.baseUrl = baseUrl.replace(/\/$/, '');
    }
    
    if (email) {
      if (!email.includes('@')) {
        throw new Error('Email inválido');
      }
      this._config.email = email;
    }
    
    if (token) {
      this._config.token = token;
    }
    
    if (jql) {
      this._config.jql = jql;
    }
    
    if (cacheTtlMinutes !== undefined) {
      this._config.cacheTtlMinutes = parseInt(cacheTtlMinutes, 10) || 10;
    }
    
    this._saveConfig();
    return this.getConfig();
  }

  getToken() {
    return this._config.token;
  }

  getJQL() {
    return this._config.jql;
  }

  getCacheTtl() {
    return (this._config.cacheTtlMinutes || 10) * 60 * 1000;
  }

  updateSyncStatus(status, error = null) {
    this._config.lastSync = new Date().toISOString();
    this._config.lastSyncStatus = status;
    this._config.lastSyncError = error;
    this._saveConfig();
  }

  clearCache() {
    this._config.lastSync = null;
    this._config.lastSyncStatus = null;
    this._config.lastSyncError = null;
    this._saveConfig();
  }

  isConfigured() {
    return !!(this._config.baseUrl && this._config.email && this._config.token);
  }
}

export const configService = new ConfigService();
