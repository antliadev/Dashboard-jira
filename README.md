# Jira Dashboard

Painel de gestão de projetos Jira com visualização executiva, board Kanban e métricas.

##快速开始

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### Instalação

```bash
npm install
```

### Executar

**Modo desenvolvimento (ambos servers):**
```bash
npm run dev:all
```

Ou execute o script:
```bash
start-dev.bat
```

**Servidor backend (porta 3001):**
```bash
npm run dev:server
```

**Servidor frontend (porta 5173):**
```bash
npm run dev
```

### Acesso

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api/jira
- Health: http://localhost:3001/health

## Configuração

1. Acesse a página **Dados** no menu lateral
2. Preencha as credenciais do Jira:
   - **Base URL**: https://suaempresa.atlassian.net
   - **Email**: seu-email@empresa.com
   - **API Token**: Gere em https://id.atlassian.com/manage-profile/security/api-tokens
3. Clique em **Testar Conexão**
4. Clique em **Salvar Configuração**
5. Clique em **Sincronizar Agora**

## Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/jira` | Lista todos os endpoints |
| GET | `/api/jira/config` | Retorna configuração atual |
| POST | `/api/jira/config` | Salva configuração |
| POST | `/api/jira/test-connection` | Testa conexão |
| GET | `/api/jira/sync/status` | Status da sincronização |
| POST | `/api/jira/sync` | Sincroniza dados |
| GET | `/api/jira/dashboard` | Dados do dashboard |
| GET | `/api/jira/issues` | Lista de tickets |
| GET | `/api/jira/projects` | Lista de projetos |
| GET | `/api/jira/analysts` | Lista de analistas |
| GET | `/api/jira/statuses` | Lista de status |
| GET | `/api/jira/metrics` | Métricas |
| GET | `/api/jira/board` | Board Kanban |
| POST | `/api/jira/cache/clear` | Limpa cache |
| GET | `/api/jira/cache/stats` | Status do cache |

## Estrutura do Projeto

```
dashboard-jira/
├── server/
│   ├── index.js           # Servidor Express
│   ├── routes/
│   │   └── jira.js        # Rotas da API
│   └── services/
│       ├── jiraService.js   # Integração Jira
│       └── configService.js # Gerenciamento config
├── src/
│   ├── pages/             # Páginas do frontend
│   ├── components/        # Componentes reutilizáveis
│   ├── data/              # Serviços de dados
│   ├── styles/            # CSS
│   └── utils/             # Utilitários
├── vite.config.js         # Configuração Vite
└── package.json
```

## JQL Utilizada

```sql
project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1)
AND status is not EMPTY
ORDER BY project ASC, status ASC, assignee ASC, updated DESC
```

## Segurança

- Token API nunca é exposto no frontend
- Token armazenado apenas em memória no backend
- Configurações sensíveis em arquivo separado (não versionado)
- Proxy Vite para evitar CORS

## Tech Stack

- **Frontend**: Vanilla JS, Chart.js, Vite
- **Backend**: Node.js, Express, Node-Cache
- **API**: Jira REST API v3