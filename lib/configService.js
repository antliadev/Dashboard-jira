/**
 * configService.js — Serviço de configuração do Jira
 * 
 * Em desenvolvimento: usa variáveis de ambiente + arquivo local
 * Em produção (Vercel): usa apenas variáveis de ambiente
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Verificar se está em produção Vercel
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || IS_VERCEL;

// Arquivo local para desenvolvimento
const CONFIG_FILE = path.join(__dirname, '../jira-config.json');

const DEFAULT_JQL = 'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY project ASC, status ASC, assignee ASC, updated DESC';
const DEFAULT_CACHE_TTL = 10;

class ConfigService {
  constructor() {
    this._config = this._loadConfig();
  }

  _loadConfig() {
    // Em produção, usar apenas variáveis de ambiente
    if (IS_PRODUCTION) {
      return {
        baseUrl: process.env.JIRA_BASE_URL || '',
        email: process.env.JIRA_EMAIL || '',
        token: process.env.JIRA_API_TOKEN || '',
        jql: process.env.JIRA_JQL || DEFAULT_JQL,
        cacheTtlMinutes: parseInt(process.env.JIRA_CACHE_TTL) || DEFAULT_CACHE_TTL,
        lastSync: null,
        lastSyncStatus: null,
        lastSyncError: null
      };
    }

    // Em desenvolvimento, tentar carregar do arquivo
    let configFromFile = {};
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        configFromFile = JSON.parse(data);
      }
    } catch (error) {
      console.error('[ConfigService] Erro ao carregar configuração:', error.message);
    }

    return {
      baseUrl: configFromFile.baseUrl || process.env.JIRA_BASE_URL || '',
      email: configFromFile.email || process.env.JIRA_EMAIL || '',
      token: process.env.JIRA_API_TOKEN || '', // Token sempre via env em dev também por segurança
      jql: configFromFile.jql || process.env.JIRA_JQL || DEFAULT_JQL,
      cacheTtlMinutes: configFromFile.cacheTtlMinutes || parseInt(process.env.JIRA_CACHE_TTL) || DEFAULT_CACHE_TTL,
      lastSync: configFromFile.lastSync || null,
      lastSyncStatus: configFromFile.lastSyncStatus || null,
      lastSyncError: configFromFile.lastSyncError || null
    };
  }

  _saveConfig() {
    // Nunca salvar em produção
    if (IS_PRODUCTION) {
      return;
    }

    try {
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

  getConfig() {
    return {
      baseUrl: this._config.baseUrl,
      email: this._config.email,
      jql: this._config.jql,
      cacheTtlMinutes: this._config.cacheTtlMinutes,
      hasToken: !!this._config.token,
      tokenMasked: this._config.token ? '********' + this._config.token.slice(-4) : null,
      lastSync: this._config.lastSync,
      lastSyncStatus: this._config.lastSyncStatus,
      lastSyncError: this._config.lastSyncError,
      isConfigured: !!(this._config.baseUrl && this._config.email && this._config.token),
      isProduction: IS_PRODUCTION
    };
  }

  setConfig({ baseUrl, email, token, jql, cacheTtlMinutes }) {
    // Em produção, não permite alterar configuração via API
    if (IS_PRODUCTION) {
      throw new Error('Configuração em produção não pode ser alterada via API. Use variáveis de ambiente.');
    }

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
      this._config.cacheTtlMinutes = parseInt(cacheTtlMinutes, 10) || DEFAULT_CACHE_TTL;
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
    return (this._config.cacheTtlMinutes || DEFAULT_CACHE_TTL) * 60 * 1000;
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