/**
 * api/jira/test-connection.js — Testa conexão com Jira Cloud (RECONSTRUÍDO)
 *
 * REGRAS:
 * - Credenciais DEVEM vir no body do request
 * - NÃO busca credenciais do banco
 * - Apenas testa, NÃO persiste nada
 */
import { testJiraConnection } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // NÃO exige verifyAuth — o teste de conexão pode ser feito sem login
  // (o usuário precisa testar ANTES de sincronizar)

  try {
    const { baseUrl, email, token, jql } = req.body || {};

    // Validação: credenciais obrigatórias no body
    if (!baseUrl) {
      return res.status(400).json({ success: false, error: 'URL do Jira é obrigatória.' });
    }
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório.' });
    }
    if (!token) {
      return res.status(400).json({ success: false, error: 'API Token é obrigatório.' });
    }

    // Testar conexão com a API do Jira
    const result = await testJiraConnection(baseUrl, email, token, jql);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Conexão estabelecida com sucesso!',
        user: result.user,
        testResult: result.testResult
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[test-connection] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}