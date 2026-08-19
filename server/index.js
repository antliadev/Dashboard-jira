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

// Body parsing: in dev mode (local server), use express.json().
// In Vercel, api/index.js pre-parses req.body before Express processes it.
// express.json() skips if req.body is already set.
app.use(express.json({ limit: '1mb' }));


// ─── Rotas de autenticação (públicas) ───────────────────
// O frontend e a funcao Vercel usam /api/auth. Mantemos os aliases antigos.
app.post('/api/auth', auth.handleLogin);
app.get('/api/auth', auth.handleCheckSession);
app.delete('/api/auth', auth.handleLogout);
app.post('/api/auth/login', auth.handleLogin);
app.post('/api/auth/logout', auth.handleLogout);
app.get('/api/auth/check', auth.handleCheckSession);

// ─── Middleware de proteção opcional ────────────────────────────
// As APIs do Jira usam credenciais armazenadas no banco (criptografadas)
// Não precisam de sessão do usuário
function optionalAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  
  // Se não tem sessionId, permite acesso (as APIs usam credenciais do banco)
  if (!sessionId) {
    return next();
  }
  
  // Se tem sessionId, valida (opcional)
  const session = auth.validateSession(sessionId);
  if (session) {
    req.session = session;
  }
  
  next();
}

// Rotas do Jira sem autenticação obrigatória
app.use('/api/jira', optionalAuth, jiraRoutes);

// Rota raiz para verificação rápida (sem proteção obrigatória)
app.get('/api/jira', optionalAuth, (req, res) => {
  res.json({
    status: 'ok',
    message: 'Jira Dashboard API (Desenvolvimento)',
    endpoints: [
      'GET  /api/jira/config          - Configuração atual',
      'POST /api/jira/config          - Salva configuração',
      'POST /api/jira/test-connection - Testa conexão com Jira',
      'GET  /api/jira/sync/status     - Status da sincronização',
      'POST /api/jira/sync            - Sincroniza Jira → banco (credenciais do body)',
      'POST /api/jira/sync/start      - Sincroniza Jira → banco (apenas env vars)',
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

// Agendador de sincronização automática em background (para servidor Node/Standalone)
// Executa a cada 1 hora entre 06:00 e 18:00 de segunda a sexta-feira (Horário de Brasília)
function initAutoSyncScheduler() {
  let lastRanKey = '';

  setInterval(async () => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour12: false,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const parts = formatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '-1', 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '-1', 10);

      const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
      const isHourRange = hour >= 6 && hour <= 18;
      const currentKey = `${year}-${month}-${day}T${hour}`;

      // Executa no início de cada hora (minuto 0) ou logo que detectar a nova hora dentro da janela
      if (isWeekday && isHourRange && minute === 0 && lastRanKey !== currentKey) {
        lastRanKey = currentKey;
        console.log(`[AutoSync] Disparando sincronizacao automatica (${hour}:00 BRT - ${weekday})...`);
        const { executeAutoSync } = await import('../lib/syncJobService.js');
        const result = await executeAutoSync('node-scheduler', { forceScheduleCheck: true });
        console.log('[AutoSync] Resultado da sincronizacao automatica:', result?.status || 'concluido');
      }
    } catch (err) {
      console.error('[AutoSync] Erro no agendador:', err.message);
    }
  }, 30 * 1000); // Checa a cada 30 segundos
}

// Iniciar servidor e agendador
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[Server] Rodando na porta ${PORT}`);
    console.log(`[Server] API Jira: http://localhost:${PORT}/api/jira`);
    initAutoSyncScheduler();
  });
}

export default app;

