/**
 * api/jira/sync.js — Sincronização Jira → Supabase (RECONSTRUÍDO)
 *
 * REGRAS:
 * - Credenciais DEVEM vir no body do request (baseUrl, email, token)
 * - NÃO busca credenciais do banco
 * - NÃO persiste credenciais
 * - Salva APENAS os dados importados (issues)
 * 
 * Fluxo:
 * 1. Recebe credenciais no body
 * 2. Busca TODOS os issues do Jira com paginação
 * 3. Normaliza os dados
 * 4. Faz upsert no Supabase (jira_issues)
 * 5. Retorna resumo da sincronização
 */
import { verifyAuth } from '../auth/verify.js';
import { fetchAllIssuesFromJira, upsertIssuesToDatabase } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // Verificar autenticação
  const isAuthed = await verifyAuth(req, res);
  if (!isAuthed) return;

  try {
    const { baseUrl, email, token, jql } = req.body || {};

    // REGRA: Credenciais DEVEM vir no body
    if (!baseUrl || !email || !token) {
      return res.status(400).json({
        success: false,
        error: 'Credenciais obrigatórias: baseUrl, email e token devem ser fornecidos no formulário.'
      });
    }

    // Sanitizar
    const cleanBaseUrl = baseUrl.trim().replace(/\/$/, '');
    const cleanEmail = email.trim();
    const cleanToken = token.trim();
    const effectiveJql = jql?.trim() || 'project is not EMPTY ORDER BY updated DESC';

    // Validações básicas
    if (!cleanBaseUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL deve começar com https://' });
    }

    console.log(`[sync] Iniciando sincronização. Base: ${cleanBaseUrl}, JQL: ${effectiveJql.substring(0, 60)}...`);

    // 1. Buscar issues do Jira com paginação completa
    const rawIssues = await fetchAllIssuesFromJira(cleanBaseUrl, cleanEmail, cleanToken, effectiveJql);

    if (rawIssues.length === 0) {
      return res.status(200).json({
        success: true,
        warning: 'Nenhum ticket retornado pelo Jira. Verifique se a JQL está correta.',
        totalIssues: 0,
        inserted: 0,
        updated: 0
      });
    }

    // 2. Upsert no Supabase (normalização acontece dentro do upsert)
    const dbResult = await upsertIssuesToDatabase(rawIssues);

    console.log(`[sync] Concluído. Total: ${dbResult.total}, Novos: ${dbResult.inserted}, Atualizados: ${dbResult.updated}`);

    // 3. Retornar resumo
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
    console.error('[sync] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}