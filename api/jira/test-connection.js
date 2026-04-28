/**
 * test-connection.js — Testa conexão com Jira Cloud
 *
 * Aceita credenciais no body ou busca do Supabase (jira_connections).
 * Usa a função testJiraConnection do lib/jiraService.js.
 */
import { configService } from '../../lib/configService.js';
import { testJiraConnection } from '../../lib/jiraService.js';

export default async function handler(req, res) {
  // Suporte a CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    let { baseUrl, email, token, jql } = req.body || {};

    // Se credenciais não foram fornecidas no body, buscar do Supabase
    if (!baseUrl || !email || !token) {
      const conn = await configService.getActiveConnection();
      if (conn) {
        baseUrl = baseUrl || conn.baseUrl;
        email   = email   || conn.email;
        token   = token   || conn.token;
        jql     = jql     || conn.jql;
      }
    }

    // Validação mínima antes de chamar a API
    if (!baseUrl) {
      return res.status(400).json({ success: false, error: 'URL do Jira é obrigatória. Configure na página Dados.' });
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