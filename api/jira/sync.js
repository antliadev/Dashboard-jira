/**
 * sync.js — Serverless handler: Sincroniza Jira → Supabase
 *
 * 1) Busca credenciais do Supabase (jira_connections)
 * 2) Busca TODOS os issues do Jira com paginação (nextPageToken)
 * 3) Faz upsert no banco por issue_id (sem duplicatas)
 * 4) Retorna resumo da sincronização
 */
import { configService } from '../../lib/configService.js';
import { fetchAllIssuesFromJira, upsertIssuesToDatabase } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    // 1) Buscar credenciais — prioridade: body > Supabase
    let { baseUrl, email, token, jql } = req.body || {};

    if (!baseUrl || !email || !token) {
      const conn = await configService.getActiveConnection();
      if (!conn) {
        return res.status(400).json({
          success: false,
          error: 'Credenciais não configuradas. Acesse a página Dados e configure a conexão com o Jira.'
        });
      }
      baseUrl = baseUrl || conn.baseUrl;
      email   = email   || conn.email;
      token   = token   || conn.token;
      jql     = jql     || conn.jql;
    }

    // Sanitizar
    baseUrl = baseUrl.trim().replace(/\/$/, '');
    email   = email.trim();
    token   = token.trim();
    const effectiveJql = jql?.trim() ||
      'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY updated DESC';

    configService.updateSyncStatus('running');

    // 2) Buscar issues do Jira com paginação completa
    const rawIssues = await fetchAllIssuesFromJira(baseUrl, email, token, effectiveJql);

    if (rawIssues.length === 0) {
      configService.updateSyncStatus('success');
      return res.status(200).json({
        success: true,
        warning: 'Nenhum ticket retornado pelo Jira. Verifique se a JQL está correta e se há projetos com issues.',
        totalIssues: 0,
        inserted: 0,
        updated: 0
      });
    }

    // 3) Upsert no Supabase (sem duplicatas, atualiza existentes)
    const dbResult = await upsertIssuesToDatabase(rawIssues);

    configService.updateSyncStatus('success');

    // 4) Retornar resumo
    return res.status(200).json({
      success: true,
      lastSyncedAt: new Date().toISOString(),
      totalIssues: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
      preview: rawIssues.slice(0, 5).map(i => ({
        key: i.key,
        title: i.fields?.summary,
        project: i.fields?.project?.key,
        status: i.fields?.status?.name,
        assignee: i.fields?.assignee?.displayName || 'Não atribuído'
      }))
    });
  } catch (error) {
    configService.updateSyncStatus('error', error.message);
    console.error('[sync] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}