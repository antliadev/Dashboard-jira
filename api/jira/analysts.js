/**
 * analysts.js — Retorna analistas distintos do banco
 */
import { fetchIssuesFromDatabase, buildDashboardData } from '../../lib/jiraService.js';
import { verifyAuth } from '../../auth/verify.js';

export default async function handler(req, res) {
  // Verificar autenticação
  const isAuth = await verifyAuth(req, res);
  if (!isAuth) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const issues = await fetchIssuesFromDatabase();
    if (issues.length === 0) {
      return res.status(200).json([]);
    }
    const data = buildDashboardData(issues);
    return res.status(200).json(data.analysts);
  } catch (error) {
    console.error('[analysts] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
}