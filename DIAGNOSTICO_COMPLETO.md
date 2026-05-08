# DIAGNÓSTICO COMPLETO DO PROJETO — JIRA DASHBOARD ANTALIA

**Arquivo de Contexto para Continuidade de Desenvolvimento**
**Data de Geração:** 08/05/2026
**Versão do Sistema:** 1.0.0

---

## 1. VISÃO GERAL DO PROJETO

### 1.1 Objetivo Principal

O **Jira Dashboard Antalia** é um painel corporativo de alto nível para gestão estratégica de projetos Jira. O sistema foi desenvolvido para fornecer:

- **Visão Executiva Centralizada**: Dashboard consolidado com métricas de progresso, prazos e indicadores de saúde dos projetos.
- **Auditoria de Saúde de Dados (Data Health)**: Sistema inteligente que detecta tickets sem analista, sem prazo ou sem prioridade, garantindo qualidade na gestão.
- **Sincronização Global**: Um único clique sincroniza dados do Jira para toda a equipe via backend serverless.
- **Segurança Enterprise**: Credenciais do Jira criptografadas (AES-256-GCM) e armazenadas no Supabase.
- **Watchdog de Estabilidade**: Auto-recuperação para processos de sincronização interrompidos.

### 1.2 Contexto Comercial

O sistema é utilizado pela **Antlia Dev** para monitoramento de múltiplos projetos Jira, consolidando dados de diferentes projetos em uma única interface unificada. O foco é em gestão executiva, acompanhamento de produtividade de times e identificação proativa de problemas (tickets bloqueados, atrasados, com dados incompletos).

---

## 2. STACK TECNOLÓGICA

### 2.1 Frontend

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Vanilla JavaScript** | ES2023 | Máxima performance, zero overhead |
| **Vite** | 8.0.10 | Build tool e dev server |
| **Chart.js** | 4.5.1 | Visualizações de dados (gráficos doughnut) |
| **html2canvas** | 1.4.1 | Exportação PNG do Resumo Executivo |
| **jsPDF** | 4.2.1 | Exportação PDF do Resumo Executivo |
| **TypeScript** | — | Configuração TS disponível (tipagem em src/) |

### 2.2 Backend & Infraestrutura

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Node.js** | 18+ | Runtime server |
| **Express** | 4.21.2 | Framework API REST |
| **Supabase** | SDK 2.104.1 | Database + Auth + RLS |
| **Vercel Functions** | 3.4.6 | Serverless em produção |
| **dotenv** | 16.4.5 | Gerenciamento de variáveis |
| **cors** | 2.8.5 | Middleware CORS |
| **node-cache** | 5.1.2 | Cache em memória |

### 2.3 Banco de Dados

| Serviço | Função |
|---------|--------|
| **Supabase (PostgreSQL)** | Single Source of Truth |
| **Supabase RLS** | Segurança em nível de linha |
| **Tabela `jira_issues`** | Tickets sincronizados do Jira |
| **Tabela `jira_connections`** | Credenciais criptografadas |
| **Tabela `jira_sync_jobs`** | Controle de jobs de sync |

---

## 3. ESTRUTURA DE PASTAS

```
dashboard-jira/
├── api/                           # APIs (funções serverless Vercel)
│   ├── auth/
│   │   ├── index.js              # Login/logout
│   │   ├── verify.js             # Verificação de sessão
│   │   └── middleware.js         # Middleware auth
│   └── jira/
│       ├── dashboard.js          # Dados agregados
│       ├── projects.js           # Listagem projetos
│       ├── issues.js             # Listagem tickets
│       ├── test-connection.js    # Teste conexão Jira
│       ├── sync.js               # Início sincronização
│       ├── sync/
│       │   ├── worker.js        # Worker de sync
│       │   └── status.js        # Status do job
│       └── cache/clear.js        # Limpa cache
│
├── server/                        # Servidor Express (dev)
│   ├── index.js                  # Entrada Express
│   ├── routes/jira.js            # Rotas Jira
│   ├── services/jiraService.js  # (duplicado?)
│   └── auth.js                   # Autenticação
│
├── src/                          # Frontend
│   ├── main.js                   # Entry point SPA
│   ├── components/
│   │   └── sidebar.js            # Navegação lateral
│   ├── data/
│   │   ├── data-service.js       # Camada de dados (CRUD)
│   │   ├── models.js             # Modelos de domínio
│   │   └── mock-data.js         # Dados mock (fallback)
│   ├── pages/
│   │   ├── dashboard.js          # Dashboard executivo
│   │   ├── login.js              # Página login
│   │   ├── projects.js           # Grid de projetos
│   │   ├── cards.js             # Tabela de tickets
│   │   ├── board.js              # Kanban drag-drop
│   │   ├── analysts.js           # Cards de analistas
│   │   ├── data.js               # Configuração/sync
│   │   └── executive.js         # Resumo executivo
│   ├── utils/
│   │   ├── router.js             # SPA Router (hash-based)
│   │   └── helpers.js           # Utilitários
│   └── styles/
│       ├── main.css             # Design system completo
│       └── executive.css        # Estilos Resumo Executivo
│
├── lib/                          # Bibliotecas compartilhadas (server + client)
│   ├── supabaseServer.js        # Cliente Supabase backend
│   ├── configService.js         # Gerenciamento config Jira
│   ├── syncJobService.js        # Background jobs
│   ├── jiraService.js           # Integração Jira API
│   └── encryption.js            # Criptografia AES-256-GCM
│
├── sql/                         # Scripts de banco
│   ├── supabase-setup.sql       # Schema principal
│   ├── migration-add-sync-jobs.sql
│   ├── migration-add-columns.sql
│   ├── migration-add-sessions.sql
│   └── verify-and-fix-schema.sql
│
├── public/                      # Assets estáticos
│   ├── favicon.svg
│   └── icons.svg
│
├── dist/                       # Build de produção
├── package.json
├── vite.config.js
├── tsconfig.json
├── vercel.json
├── .env.example
├── .env                        # (não versionado)
├── README.md
├── ARCHITECTURE.md
└── DIAGNOSTICO_COMPLETO.md     # Este arquivo
```

---

## 4. FUNCIONALIDADES IMPLEMENTADAS

### 4.1 Funcionalidades Prontas ✅

| Funcionalidade | Status | Descrição |
|---------------|--------|-----------|
| **Dashboard Executivo** | ✅ Completo | KPIs, gráficos Chart.js, tabelas, filtros, auditoria de dados |
| **Board Kanban** | ✅ Completo | Drag-drop, colunas por status, scroll horizontal/vertical |
| **Lista de Projetos** | ✅ Completo | Grid de cards com stats, saúde, progresso |
| **Lista de Tickets (Cards)** | ✅ Completo | Tabela filtrável, ordenável, paginada |
| **Lista de Analistas** | ✅ Completo | Cards com produtividade, métricas por usuário |
| **Resumo Executivo** | ✅ Completo | KPIs por projeto, exportar PNG/PDF, farol de projeto |
| **Configuração Jira** | ✅ Completo | Form de credenciais, sync, status |
| **Autenticação** | ✅ Completo | Login com session, localStorage, middleware |
| **Sistema de Filtros** | ✅ Completo | Múltiplos filtros (projeto, analista, status, prioridade, data) |
| **Exportação Exec** | ✅ Completo | PNG e PDF via html2canvas + jsPDF |
| **Sincronização Jira** | ✅ Completo | Background job, paginação, retry, upsert batches |

### 4.2 Funcionalidades Parciais ⚠️

| Funcionalidade | Status | Observação |
|---------------|--------|------------|
| **Drag & Drop no Kanban** | ⚠️ Parcial | UI implementada mas não persiste mudanças |
| **Cache de sessão** | ⚠️ Parcial | Sessões em memória (não durability em produção) |

### 4.3 Funcionalidades Mockadas 🎭

| Funcionalidade | Status | Descrição |
|---------------|--------|-----------|
| **Dados Mock** | 🎭 Pronto | 5 projetos, 58 cards, 10 usuários em mock-data.js |

### 4.4 Funcionalidades Dependentes de API Externa 🔗

| Funcionalidade | Dependência | Status |
|---------------|-------------|--------|
| **Sincronização Jira** | Jira REST API v3 | ✅ Implementado |
| **Teste de Conexão** | Jira REST API v3 | ✅ Implementado |
| **Listagem do Dashboard** | Supabase (jira_issues) | ✅ Implementado |

---

## 5. ARQUITETURA DO SISTEMA

### 5.1 Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (SPA)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │Dashboard │  │  Board   │  │ Projects │  │ Executive    │ │
│  │  Page    │  │  Kanban  │  │   Page   │  │   Summary    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │             │             │               │         │
│       └─────────────┴─────────────┴───────────────┘         │
│                         │                                   │
│              dataService.js (Camada de Dados)               │
│                         │                                   │
│       ┌─────────────────┴─────────────────┐                 │
│       │          Router (SPA)             │                 │
│       └─────────────────┬─────────────────┘                 │
└─────────────────────────┼───────────────────────────────────┘
                          │ /api/* (Vite Proxy)
┌─────────────────────────┼───────────────────────────────────┐
│                  BACKEND (Express/Vercel)                   │
│       ┌─────────────────┴─────────────────┐                │
│       │         API Routes                │                │
│       │  /api/auth  │  /api/jira/*        │                │
│       └─────────────────┬─────────────────┘                │
│                         │                                   │
│  ┌──────────────────────┼──────────────────────┐           │
│  │              Services Layer               │            │
│  │  auth.js  │ configService.js │ jiraService │           │
│  └──────────────────────┼──────────────────────┘           │
│                         │                                   │
│       ┌─────────────────┴─────────────────┐                │
│       │         Supabase (PostgreSQL)     │                │
│       │  jira_issues │ jira_connections    │                │
│       │  jira_sync_jobs                   │                │
│       └───────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Fluxo de Dados

1. **Frontend → Backend**: Usuário acessa página → Router carrega página lazy → Página chama dataService
2. **DataService**: Decide fonte (mock/imported/API) → faz fetch para API interna
3. **API Internal**: Recebe request → autentica (opcional) → chama service
4. **Service**: Lê do Supabase OU faz sync com Jira
5. **Supabase**: Retorna dados → service processa → retorna para página

### 5.3 Padrões de Código

| Padrão | Aplicação |
|--------|-----------|
| **SPA Router Hash-based** | src/utils/router.js |
| **Lazy Loading** | src/main.js (pageImports) |
| **Service Layer** | data-service.js, jiraService.js |
| **Data Transfer Objects** | buildDashboardData(), enrichIssue() |
| **Encrypt-then-MAC** | encryption.js (AES-256-GCM) |
| **Status Category Normalization** | models.js (resolveStatusCategory) |

---

## 6. ROTAS E PÁGINAS

### 6.1 Rotas do Frontend

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Dashboard | Visão executiva com KPIs e gráficos |
| `/login` | Login | Autenticação de usuário |
| `/projects` | Projects | Grid de projetos |
| `/cards` | Cards | Tabela de tickets |
| `/board` | Board | Kanban drag-drop |
| `/analysts` | Analysts | Cards de analistas |
| `/data` | Data | Config Jira e sync |
| `/executive` | Executive | Resumo executivo por projeto |
| `/executive/:projectKey` | Executive | Resumo de projeto específico |

### 6.2 Rotas da API Backend

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth` | Login |
| GET | `/api/auth` | Verificar sessão |
| DELETE | `/api/auth` | Logout |
| GET | `/api/jira/config` | Obter config |
| POST | `/api/jira/config` | Salvar config |
| POST | `/api/jira/test-connection` | Testar conexão Jira |
| GET | `/api/jira/sync/status` | Status do sync |
| POST | `/api/jira/sync` | Iniciar sync |
| GET | `/api/jira/dashboard` | Dados agregados |
| GET | `/api/jira/issues` | Listar tickets |
| GET | `/api/jira/projects` | Listar projetos |
| GET | `/api/jira/analysts` | Listar analistas |
| GET | `/api/jira/board` | Board Kanban |
| POST | `/api/jira/cache/clear` | Limpar status sync |

---

## 7. BANCO DE DADOS

### 7.1 Tabelas do Supabase

```sql
-- jira_connections: Credenciais do Jira (criptografadas)
jira_connections (
  id UUID PRIMARY KEY,
  base_url TEXT,
  email TEXT,
  api_token_encrypted TEXT,  -- Criptografado AES-256-GCM
  jql TEXT,
  cache_ttl INTEGER,
  is_active BOOLEAN,
  last_sync_status TEXT,
  last_sync_at TIMESTAMP,
  last_sync_error TEXT
)

-- jira_issues: Tickets sincronizados
jira_issues (
  issue_id TEXT UNIQUE,    -- Chave de upsert
  issue_key TEXT,
  title TEXT,
  status_name TEXT,
  project_key TEXT,
  assignee_id TEXT,
  priority_name TEXT,
  ... (muitos campos)
)

-- jira_sync_jobs: Controle de jobs
jira_sync_jobs (
  id UUID PRIMARY KEY,
  status TEXT (queued|running|success|error),
  base_url TEXT,
  email_encrypted TEXT,
  api_token_encrypted TEXT,
  total_issues INTEGER,
  logs JSONB
)
```

### 7.2 Índices para Performance

```sql
idx_jira_issues_project_key
idx_jira_issues_status_name
idx_jira_issues_assignee_id
idx_jira_issues_synced_at
idx_jira_issues_priority_name
idx_jira_issues_type_name
idx_jira_issues_jira_updated_at
```

---

## 8. AUTENTICAÇÃO E AUTORIZAÇÃO

### 8.1 Sistema de Auth

| Aspecto | Detalhe |
|---------|---------|
| **Tipo** | Session-based (stateless) |
| **Session ID** | Armazenado em localStorage (`sessionId`) |
| **Backend** | Sessões em memória (Map) |
| **Credenciais** | Admin único: `admin@jira.com` / `admin123` |
| **Middleware** | `optionalAuth` (não obrigatório para APIs Jira) |
| **Headers** | `x-session-id` para requests autenticados |

### 8.2 Políticas de Segurança

- **RLS (Row Level Security)**: Apenas `service_role` acessa todas as tabelas
- **Criptografia**: Tokens Jira criptografados com AES-256-GCM
- **Sanitization**: Funções `sanitize()`, `sanitizeTitle()`, `sanitizeUrl()` em helpers.js

---

## 9. SEGURANÇA

### 9.1 Medidas Implementadas ✅

| Medida | Implementação |
|--------|---------------|
| **Criptografia de Tokens** | AES-256-GCM em encryption.js |
| **Sanitization** | XSS prevention em helpers.js |
| **RLS** | Row Level Security no Supabase |
| **Auth Middleware** | Session validation em server/auth.js |
| **HTTPS Only** | URLs Jira forçadas com https:// |
| **Timeout** | AbortSignal.timeout(30000) em chamadas API |

### 9.2 Pontos de Atenção ⚠️

| Ponto | Risco | Recomendação |
|-------|-------|--------------|
| Sessões em memória | Perda após restart do server | Usar Redis em produção |
| Credenciais no .env | Exposição acidental | Nunca commitear .env |
| Client-side token | Não há token JWT exposto ao frontend | Manter |
| Rate limiting | Não implementado no Express | Adicionar em produção |

---

## 10. PONTOS CRÍTICOS E PROBLEMAS

### 10.1 Problemas Estruturais

| # | Problema | Severidade | Impacto |
|---|----------|------------|---------|
| 1 | **Duplicação de jiraService** em server/services/ e lib/ | Alta | Manutenção bifurcada |
| 2 | **Sessões em memória** não persistem após restart | Média | Usuários precisam relogar |
| 3 | **JWT não implementado** — apenas session simples | Média | Limitações em escalabilidade |
| 4 | **Sem testes automatizados** | Alta | Risco de regressão |

### 10.2 Bugs Aparentes

| # | Bug | Severidade | Status |
|---|-----|------------|--------|
| 1 | Drag & drop no Kanban não persiste mudanças | Média | Funcionalidade UI apenas |
| 2 | Página data.js não mostra dados do banco já sincronizado (apenas form) | Baixa | UX melhorável |
| 3 | Session expira mas não notifica usuário claramente | Baixa | Pode causar confusão |

### 10.3 Pontos Incompletos

| # | Funcionalidade | Status |
|---|----------------|--------|
| 1 | Sistema de notificações push | Apenas estrutura/mocks |
| 2 | Dashboard em tempo real (WebSocket) | Não implementado |
| 3 | Histórico de sync | Parcial (apenas último job) |
| 4 | Múltiplas conexões Jira | Apenas 1 conexão ativa |

---

## 11. MELHORIAS RECOMENDADAS

### 11.1 Prioridade Alta (Crítico)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 1 | Adicionar testes unitários e E2E | Qualidade e manutenção |
| 2 | Implementar Redis para sessões | Durabilidade em produção |
| 3 | Limpar duplicação de jiraService | Manutenção única |
| 4 | Adicionar rate limiting | Proteção contra abuso |

### 11.2 Prioridade Média (Importante)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 1 | Persistir drag & drop no Kanban | Funcionalidade completa |
| 2 | Adicionar WebSocket para updates reais | Experiência usuário |
| 3 | Histórico de sincronizações | Auditoria completa |
| 4 | Cache Redis para dados do Jira | Performance |

### 11.3 Prioridade Baixa (Nice to Have)

| # | Melhoria | Justificativa |
|---|----------|---------------|
| 1 | Temas customizáveis (dark/light) | UI/UX |
| 2 | Relatórios agendados por email | Automação |
| 3 | Múltiplas conexões Jira | Flexibilidade |
| 4 | SSO (OAuth/Google) | Convenience |

---

## 12. ANÁLISE DE ARQUITETURA

### 12.1 Pontos Fortes ✅

| Aspecto | Avaliação |
|---------|-----------|
| **Separação de responsabilidades** | Excelente — Services, Routes, DataService |
| **Lazy loading de páginas** | Excelente — performance inicial |
| **Data normalization** | Excelente — modelos claros em models.js |
| **Criptografia de credenciais** | Excelente — AES-256-GCM |
| **Retry com backoff** | Bom — fetchWithRetry implementado |
| **Paginação de dados** | Bom — batches de 500 no Supabase |

### 12.2 Pontos de Atenção ⚠️

| Aspecto | Avaliação |
|---------|-----------|
| **Sessões stateless** | Frágil — em memória, não survive restart |
| **Duplicação de código** | Problema — jiraService em 2 lugares |
| **Sem testes** | Risco — manutenção comprometida |
| **Cache simples** | Limitado — node-cache em memória |

---

## 13. ANÁLISE DE ESCALABILIDADE

### 13.1 Capacidade Atual

| Métrica | Valor | Observação |
|---------|-------|------------|
| **Máximo tickets por sync** | 5.000 | Limite MAX_PAGES no jiraService |
| **Tamanho lote upsert** | 500 | Otimizado para Supabase |
| **Timeout por página Jira** | 30s | Para evitar timeout em serverless |
| **Session storage** | In-memory (Map) | Limitado a uma instância |

### 13.2 Limitações Identificadas

| Limitação | Impacto | Solução Recomendada |
|-----------|---------|---------------------|
| Sessões em memória | Não escala horizontalmente | Redis |
| node-cache local | Não compartilha entre instâncias | Redis ou CDN |
| Sem rate limiting | Vulnerável a abuse | API Gateway ou middleware |
| 5.000 tickets max | Para projetos grandes, insuficiente | Paginação chunks |

---

## 14. ANÁLISE VISUAL/UI/UX

### 14.1 Design System

| Aspecto | Status |
|---------|--------|
| **Dark-first** | ✅ Implementado (--bg-primary: #0f1117) |
| **Tipografia** | Inter (Google Fonts) |
| **Cores** | Variables CSS completas |
| **Responsividade** | breakpoints em main.css |
| **Componentes** | Badges, botões, tabelas, cards, kpis |

### 14.2 Páginas Implementadas

| Página | Qualidade UI | Funcionalidade |
|--------|--------------|----------------|
| Dashboard | Boa | Completa |
| Board Kanban | Boa | Completa (sem persist) |
| Projects | Boa | Completa |
| Cards | Boa | Completa |
| Analysts | Boa | Completa |
| Executive | Excelente | Completa |
| Login | Boa | Completa |
| Data | Regular | Apenas form |

### 14.3 Pontos de Melhoria UI/UX

- **Data page**: Não mostra dados já sincronizados, apenas formulário
- **Empty states**: Podem ser mais informativos
- **Loading states**: Spinner genérico, sem skeleton screens
- **Mobile**: Sidebar colapsada, mas experiência pode melhorar

---

## 15. NÍVEL DE MATURIDADE DO PROJETO

### 15.1 Avaliação por Categoria

| Categoria | Maturidade | Notas |
|-----------|------------|-------|
| **Frontend** | 85% | SPA completa, boa estrutura, faltan testes |
| **Backend** | 75% | APIs funcionam, mas sem testes, dup code |
| **Database** | 90% | Schema bem projetado, índices, RLS |
| **Security** | 80% | Criptografia OK, auth simples, sem 2FA |
| **DevOps** | 70% | Vercel ready, mas sem CI/CD |
| **UX/UI** | 80% | Design consistente, experiência boa |

### 15.2 Classificação Geral

**Nível: PRODUÇÃO (com ressalvas)**

O sistema está **pronto para produção** com as seguintes condições:
- Supabase configurado e schema aplicado
- Credenciais Jira criptografadas
-部署 em Vercel funciona

**Ressalvas para produção robusta:**
1. Adicionar testes antes de expandir
2. Implementar Redis para sessões
3. Adicionar monitoramento (logs, errors)
4. Configurar CI/CD

---

## 16. O QUE FALTA PARA PRODUÇÃO ROBUSTA

| Item | Status | Importância |
|------|--------|-------------|
| Supabase schema aplicado | ✅ Pronta se DB existir | Crítica |
| Criptografia tokens | ✅ Implementada | Crítica |
| Deploy Vercel | ✅ Configurado | Alta |
| **Testes automatizados** | ❌ Não existe | Alta |
| **Redis para sessões** | ❌ Não implementado | Média |
| **Rate limiting** | ❌ Não implementado | Média |
| **Monitoramento** | ❌ Não implementado | Média |
| **CI/CD** | ❌ Não implementado | Média |

---

## 17. ROADMAP RECOMENDADO

### Fase 1 — Estabilização (Semanas 1-2)
- [ ] Remover duplicação jiraService (unificar em lib/)
- [ ] Adicionar testes unitários básicos
- [ ] Limpar console.logs de debug
- [ ] Validar semua rotas e fluxos

### Fase 2 — Produção (Semanas 3-4)
- [ ] Implementar Redis para sessões
- [ ] Adicionar rate limiting
- [ ] Configurar monitoramento (Sentry?)
- [ ] Setup CI/CD (GitHub Actions)

### Fase 3 — Evolução (Semanas 5-8)
- [ ] Persistir drag & drop no Kanban
- [ ] Adicionar WebSocket para updates
- [ ] Histórico de sincronizações
- [ ] Temas (dark/light toggle)

---

## 18. RESUMO EXECUTIVO

### O que funciona
- Dashboard completo com KPIs, gráficos, filtros
- Board Kanban funcional (drag & drop visual)
- Sincronização Jira → Supabase com retry
- Criptografia de credenciais
- Autenticação com session
- Exportação PNG/PDF do Resumo Executivo
- Deploy Vercel configurado

### O que precisa melhorar
- **Testes**: Zero testes automatizados
- **Sessões**: Em memória (não durável)
- **Duplicação**: jiraService em 2 lugares
- **Persistence**: Drag & drop não persiste

### Decisões críticas para próxima IA
1. **Manter arquitetura SPA Vanilla** — funciona bem, não mudar
2. **Unificar jiraService** — remover duplicação
3. **Adicionar testes** — prioritário antes de expandir
4. **Sessões Redis** — se escalabilidade for necessária

---

## 19. CONTEXTO ADICIONAL

### 19.1 Credenciais do Sistema

- **Admin Login**: `admin@jira.com` / `admin123`
- **JQL Padrão**: `project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY project ASC, status ASC, assignee ASC, updated DESC`

### 19.2 Variáveis de Ambiente Necessárias

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JIRA_ENCRYPTION_KEY=minimo_32_caracteres
AUTH_EMAIL=admin@jira.com
AUTH_PASSWORD=admin123
```

### 19.3 Endpoints Úteis

- Frontend dev: http://localhost:5173
- Backend dev: http://localhost:3001
- API test: http://localhost:3001/api/jira

---

**Fim do Diagnóstico**

Este documento deve ser usado como referência primária para qualquer continuidade de desenvolvimento. Todas as decisões arquiteturais, padrões de código e funcionalidades estão documentadas acima.

Para próxima IA: Comece lendo este arquivo primeiro. Depois check o package.json e .env.example para configurações. O fluxo principal está em data-service.js → jiraService.js → Supabase.