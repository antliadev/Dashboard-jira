/**
 * server/index.js — Servidor Express para desenvolvimento local
 *
 * Usa as mesmas funções do lib/ que o Vercel usa em produção.
 * O Vite faz proxy de /api/* para este servidor (porta 3001).
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jiraRoutes from './routes/jira.js';
import * as auth from './auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rotas de autenticação
app.post('/api/auth/login', auth.handleLogin);
app.post('/api/auth/logout', auth.handleLogout);
app.get('/api/auth/check', auth.handleCheckSession);

// Todas as rotas Jira
app.use('/api/jira', jiraRoutes);

// Rota raiz para verificação rápida
app.get('/api/jira', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Jira Dashboard API (Desenvolvimento)',
    endpoints: [
      'GET  /api/jira/config          - Configuração atual',
      'POST /api/jira/config          - Salva configuração',
      'POST /api/jira/test-connection - Testa conexão com Jira',
      'GET  /api/jira/sync/status     - Status da sincronização',
      'POST /api/jira/sync            - Sincroniza Jira → banco',
      'GET  /api/jira/dashboard       - Dados agregados (do banco)',
      'GET  /api/jira/issues          - Lista de tickets (do banco)',
      'GET  /api/jira/projects        - Projetos (do banco)',
      'GET  /api/jira/analysts        - Analistas (do banco)',
      'GET  /api/jira/statuses        - Status (do banco)',
      'GET  /api/jira/metrics         - Métricas (do banco)',
      'GET  /api/jira/board           - Board Kanban (do banco)'
    ],
    note: 'Dados são lidos do Supabase. Apenas /sync chama a API do Jira.'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('[Server] Erro não tratado:', err.message);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Iniciar servidor
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[Server] Rodando na porta ${PORT}`);
    console.log(`[Server] API Jira: http://localhost:${PORT}/api/jira`);
  });
}

export default app;