import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jiraRoutes from './routes/jira.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/jira', jiraRoutes);

// Rota raiz /api/jira para teste
app.get('/api/jira', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Jira Dashboard API (Desenvolvimento)',
    endpoints: [
      'GET  /api/jira                 - Esta lista de endpoints',
      'GET  /api/jira/config          - Retorna configuração atual',
      'POST /api/jira/config          - Salva configuração do Jira',
      'POST /api/jira/test-connection - Testa conexão com Jira',
      'GET  /api/jira/sync/status     - Status da sincronização',
      'POST /api/jira/sync            - Sincroniza dados do Jira',
      'GET  /api/jira/dashboard       - Dados do dashboard',
      'GET  /api/jira/issues          - Lista de tickets',
      'GET  /api/jira/projects        - Lista de projetos',
      'GET  /api/jira/analysts        - Lista de analistas',
      'GET  /api/jira/statuses        - Lista de status',
      'GET  /api/jira/metrics         - Métricas',
      'GET  /api/jira/board           - Board Kanban',
      'POST /api/jira/cache/clear     - Limpa cache',
      'GET  /api/jira/cache/stats     - Status do cache'
    ],
    production: 'Use Vercel para deploy em produção com rotas em /api/jira/*'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.message);
  
  if (err.message.includes('credenciais')) {
    return res.status(401).json({ error: 'Credenciais do Jira não configuradas' });
  }
  
  if (err.message.includes('JQL')) {
    return res.status(400).json({ error: `JQL inválida: ${err.message}` });
  }
  
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Apenas iniciar servidor em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`API Jira disponível em http://localhost:${PORT}/api/jira`);
  });
}

export default app;