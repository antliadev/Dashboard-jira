/**
 * configService.js — Serviço de configuração do Jira com Supabase
 * 
 * Em produção: usa Supabase para persistência
 * Em desenvolvimento: usa arquivo local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, isConfigured } from './supabaseServer.js';
import { encrypt, decrypt } from './encryption.js';

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
    // Em produção com Supabase, carregar do Supabase
    if (IS_PRODUCTION && isConfigured && supabase) {
      return {
        source: 'supabase',
        isConfigured: false // será verificado dinamicamente
      };
    }

    // Desenvolvimento - tentar carregar do arquivo
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
      baseUrl: configFromFile.baseUrl || '',
      email: configFromFile.email || '',
      token: configFromFile.token || '',
      jql: configFromFile.jql || DEFAULT_JQL,
      cacheTtlMinutes: configFromFile.cacheTtlMinutes || DEFAULT_CACHE_TTL,
      lastSync: configFromFile.lastSync || null,
      lastSyncStatus: configFromFile.lastSyncStatus || null,
      lastSyncError: configFromFile.lastSyncError || null,
      source: 'file'
    };
  }

  _saveConfigLocal(configToSave) {
    if (IS_PRODUCTION) return; // Não salvar local em produção

    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      console.error('[ConfigService] Erro ao salvar configuração:', error.message);
    }
  }

  /**
   * Busca configuração ativa do Supabase
   */
  async getActiveConnection() {
    if (!isConfigured || !supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('jira_connections')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (error) {
        console.error('[ConfigService] Erro ao buscar conexão:', error.message);
        return null;
      }

      if (!data) {
        return null;
      }

      // Descriptografar token
      let token = '';
      try {
        token = decrypt(data.api_token_encrypted);
      } catch (e) {
        console.error('[ConfigService] Erro ao descriptografar token:', e.message);
      }

      return {
        baseUrl: data.base_url,
        email: data.email,
        token: token,
        jql: data.jql,
        cacheTtl: data.cache_ttl,
        id: data.id
      };
    } catch (error) {
      console.error('[ConfigService] Erro ao buscar conexão do Supabase:', error.message);
      return null;
    }
  }

  /**
   * Salva configuração no Supabase
   */
  async saveConnection({ baseUrl, email, token, jql, cacheTtlMinutes }) {
    if (!isConfigured || !supabase) {
      // Salvar localmente em desenvolvimento
      this._config = {
        ...this._config,
        baseUrl,
        email,
        token,
        jql,
        cacheTtlMinutes
      };
      this._saveConfigLocal(this._config);
      return this.getConfig();
    }

    const tokenEncrypted = encrypt(token);

    // Desativar conexões antigas
    await supabase
      .from('jira_connections')
      .update({ is_active: false })
      .eq('is_active', true);

    // Inserir nova conexão
    const { data, error } = await supabase
      .from('jira_connections')
      .insert({
        base_url: baseUrl.replace(/\/$/, ''),
        email: email,
        api_token_encrypted: tokenEncrypted,
        jql: jql || DEFAULT_JQL,
        cache_ttl: (cacheTtlMinutes || DEFAULT_CACHE_TTL) * 60 * 1000,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[ConfigService] Erro ao salvar conexão:', error.message);
      throw new Error('Erro ao salvar configuração: ' + error.message);
    }

    return this.getConfig();
  }

  getConfig() {
    // Em produção com Supabase, retornar configuração pública
    if (IS_PRODUCTION) {
      return {
        isConfigured: true, // assumido como configurado se tem Supabase
        source: 'supabase',
        canEdit: true,
        isProduction: true
      };
    }

    // Desenvolvimento
    const { baseUrl, email, jql, cacheTtlMinutes, lastSync, lastSyncStatus, lastSyncError } = this._config;
    const hasToken = !!this._config.token;
    const isConfigured = !!(baseUrl && email && hasToken);

    return {
      baseUrl,
      email: email ? email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
      jql,
      cacheTtlMinutes,
      hasToken,
      isConfigured,
      isProduction: IS_PRODUCTION,
      source: this._config.source,
      canEdit: true,
      lastSync,
      lastSyncStatus,
      lastSyncError
    };
  }

  /**
   * Retorna configuração para uso interno (com token)
   */
  async getActiveConfig() {
    // Tentar do Supabase primeiro em produção
    if (IS_PRODUCTION && isConfigured) {
      const conn = await this.getActiveConnection();
      if (conn) {
        return conn;
      }
    }

    // Fallback para desenvolvimento
    return {
      baseUrl: this._config.baseUrl,
      email: this._config.email,
      token: this._config.token,
      jql: this._config.jql,
      cacheTtl: (this._config.cacheTtlMinutes || DEFAULT_CACHE_TTL) * 60 * 1000
    };
  }

  setConfig({ baseUrl, email, token, jql, cacheTtlMinutes }) {
    // Validar
    if (baseUrl && !baseUrl.startsWith('https://')) {
      throw new Error('URL deve começar com https://');
    }
    if (email && !email.includes('@')) {
      throw new Error('Email inválido');
    }

    // Salvar no Supabase em produção
    if (IS_PRODUCTION) {
      return this.saveConnection({ baseUrl, email, token, jql, cacheTtlMinutes });
    }

    // Salvar localmente em desenvolvimento
    this._config = {
      ...this._config,
      baseUrl: baseUrl || this._config.baseUrl,
      email: email || this._config.email,
      token: token || this._config.token,
      jql: jql || this._config.jql,
      cacheTtlMinutes: cacheTtlMinutes || this._config.cacheTtlMinutes
    };
    this._saveConfigLocal(this._config);
    return this.getConfig();
  }

  getToken() {
    // Em produção o token vem do Supabase (via getActiveConnection)
    // Nunca exposto em memória estática
    if (IS_PRODUCTION) {
      return this._config.token || null;
    }
    return this._config.token || null;
  }

  getJQL() {
    return this._config.jql || DEFAULT_JQL;
  }

  getCacheTtl() {
    return (this._config.cacheTtlMinutes || DEFAULT_CACHE_TTL) * 60 * 1000;
  }

  updateSyncStatus(status, error = null) {
    // Em produção, não persiste status de sync
    this._config.lastSync = new Date().toISOString();
    this._config.lastSyncStatus = status;
    this._config.lastSyncError = error;
    
    if (!IS_PRODUCTION) {
      this._saveConfigLocal(this._config);
    }
  }

  clearCache() {
    this._config.lastSync = null;
    this._config.lastSyncStatus = null;
    this._config.lastSyncError = null;
    
    if (!IS_PRODUCTION) {
      this._saveConfigLocal(this._config);
    }
  }

  async isConfiguredAsync() {
    // Em produção: verificar se existe conexão ativa no banco
    if (IS_PRODUCTION && isConfigured && supabase) {
      const conn = await this.getActiveConnection();
      return !!conn;
    }
    // Em desenvolvimento: verificar config local
    return !!(this._config.baseUrl && this._config.email && this._config.token);
  }

  isConfigured() {
    // Versão síncrona para compatibilidade — usa config em memória
    if (IS_PRODUCTION) {
      // Em produção não temos como saber sem consultar o banco
      // Assumimos configurado se Supabase está disponível (verificação real ocorre no handler)
      return isConfigured;
    }
    return !!(this._config.baseUrl && this._config.email && this._config.token);
  }
}

export const configService = new ConfigService();