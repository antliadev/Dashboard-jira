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

// Variáveis obrigatórias em produção
const REQUIRED_ENV_VARS = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'];

// Variável estática para persistir config em produção (entre requisições)
let SAVED_CONFIG = null;

class ConfigService {
  constructor() {
    this._config = this._loadConfig();
    this._source = this._detectSource();
  }

  _detectSource() {
    if (IS_PRODUCTION) {
      // Verificar se todas as vars obrigatórias estão setadas
      const hasAllEnv = REQUIRED_ENV_VARS.every(v => process.env[v]);
      return hasAllEnv ? 'env' : 'missing';
    }
    
    // Development - tenta carregar do arquivo
    if (fs.existsSync(CONFIG_FILE)) {
      return 'file';
    }
    
    return 'none';
  }

  _loadConfig() {
    // Em produção, primeiro verifica se há dados salvos em memória (sobrevive a recreações)
    if (IS_PRODUCTION && SAVED_CONFIG && SAVED_CONFIG.baseUrl) {
      return {
        ...SAVED_CONFIG,
        source: this._source
      };
    }
    
    // Depois usa variáveis de ambiente
    if (IS_PRODUCTION) {
      return {
        baseUrl: process.env.JIRA_BASE_URL || '',
        email: process.env.JIRA_EMAIL || '',
        token: process.env.JIRA_API_TOKEN || '',
        jql: process.env.JIRA_JQL || DEFAULT_JQL,
        cacheTtlMinutes: parseInt(process.env.JIRA_CACHE_TTL) || DEFAULT_CACHE_TTL,
        lastSync: null,
        lastSyncStatus: null,
        lastSyncError: null,
        source: this._source
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
      token: process.env.JIRA_API_TOKEN || '',
      jql: configFromFile.jql || process.env.JIRA_JQL || DEFAULT_JQL,
      cacheTtlMinutes: configFromFile.cacheTtlMinutes || parseInt(process.env.JIRA_CACHE_TTL) || DEFAULT_CACHE_TTL,
      lastSync: configFromFile.lastSync || null,
      lastSyncStatus: configFromFile.lastSyncStatus || null,
      lastSyncError: configFromFile.lastSyncError || null,
      source: this._source
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
    // Sempre retornar email completo quando disponível
    const email = this._config.email || '';
    const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '';
    
    // Em produção, fullEmail só quando source='missing' OU quando há dados salvos
    const showFullData = !IS_PRODUCTION || this._source === 'missing' || (SAVED_CONFIG && SAVED_CONFIG.email);
    
    return {
      baseUrl: this._config.baseUrl,
      email: showFullData ? email : maskedEmail,  //Mostrar completo se puder
      fullEmail: showFullData ? email : undefined,
      token: showFullData ? this._config.token : undefined,
      jql: this._config.jql,
      cacheTtlMinutes: this._config.cacheTtlMinutes,
      hasToken: !!this._config.token,
      tokenMasked: this._config.token ? '********' + this._config.token.slice(-4) : null,
      lastSync: this._config.lastSync,
      lastSyncStatus: this._config.lastSyncStatus,
      lastSyncError: this._config.lastSyncError,
      isConfigured: !!(this._config.baseUrl && this._config.email && this._config.token),
      isProduction: IS_PRODUCTION,
      source: this._source,
      // Allow edit if:
      // 1. Not locked via env var AND
      // 2. (Not in production OR source is 'missing' so user can configure)
      canEdit: process.env.JIRA_LOCK_CONFIG !== '1' && (!IS_PRODUCTION || this._source === 'missing')
    };
  }

  setConfig({ baseUrl, email, token, jql, cacheTtlMinutes }) {
    try {
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
      
      // Salva em variável estática para persistir entre requisições em produção
      if (IS_PRODUCTION) {
        SAVED_CONFIG = { ...this._config };
      }
      
      this._saveConfig();
      return this.getConfig();
    } catch (error) {
      // Se falhar, retorna config atual
      return this.getConfig();
    }
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

  /**
   * Valida se todas as variáveis de ambiente obrigatórias estão configuradas
   */
  validateEnvVars() {
    if (!IS_PRODUCTION) {
      return { valid: true, missing: [] };
    }
    
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      return { 
        valid: false, 
        missing,
        message: `Variáveis de ambiente faltando: ${missing.join(', ')}`
      };
    }
    
    return { valid: true, missing: [] };
  }
}

export const configService = new ConfigService();