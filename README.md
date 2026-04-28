# 🚀 Jira Dashboard - Antlia Dev

Painel corporativo de alto nível para gestão estratégica de projetos Jira. Uma solução robusta, escalável e segura para monitoramento de performance, visualização de cards Kanban e auditoria automatizada de integridade de dados.

---

## 🌟 Diferenciais do Projeto

*   **Visão Executiva**: Dashboards dinâmicos com métricas reais de progresso e prazos.
*   **Auditoria de Saúde (Data Health)**: Sistema inteligente que detecta tickets sem analistas, sem prazos ou sem prioridade, garantindo a qualidade da gestão.
*   **Segurança Enterprise**: Credenciais do Jira são criptografadas (AES-256-CBC) e armazenadas de forma segura no Supabase.
*   **Sincronização Global**: Um único clique sincroniza os dados para toda a equipe simultaneamente via Backend Serverless.
*   **Watchdog de Estabilidade**: Sistema de auto-recuperação para processos de sincronização interrompidos ou travados.

---

## 🛠️ Stack Tecnológica

### Frontend
*   **Vanilla JavaScript**: Máxima performance e zero overhead.
*   **Chart.js**: Visualizações de dados fluidas e interativas.
*   **CSS Moderno**: Design system baseado em variáveis (Navy/Teal) com suporte a responsividade total.

### Backend & Infra
*   **Node.js / Express**: Camada de API robusta.
*   **Supabase**: Single Source of Truth (Banco de Dados, RLS e Auth).
*   **Vercel Edge/Serverless**: Escalabilidade e deploy automatizado.
*   **Jira REST API v3**: Integração oficial e estável.

---

## 🚦 Guia de Início Rápido

### Pré-requisitos
*   Node.js 18+
*   Conta no Supabase (com tabela `jira_connections` e `jira_sync_status` criadas)
*   Token de API do Jira

### Instalação e Execução Local
1.  **Instalar dependências**:
    ```bash
    npm install
    ```
2.  **Configurar variáveis**:
    Copie o `.env.example` para `.env` e preencha as chaves do Supabase.
3.  **Iniciar**:
    ```bash
    npm run dev:all
    ```
    *   Frontend: `http://localhost:5173`
    *   Backend: `http://localhost:3001`

---

## 📑 Módulos Principais

### 1. Dashboard Estratégico
Visão consolidada de todos os projetos sob gestão. Inclui gráficos de distribuição por status, analistas mais carregados e a **Seção de Auditoria de Saúde**, que lista proativamente falhas de preenchimento no Jira.

### 2. Kanban Dinâmico
Board interativo com scroll horizontal por colunas e vertical por cards. Permite acesso rápido ao ticket original no Jira e visualização imediata de prioridades e analistas.

### 3. Gestão de Dados (Sync)
Central de configuração onde as credenciais são gerenciadas.
*   **Sincronizar Global**: Inicia o processo de busca de dados no Jira e persiste no Supabase para que todos os usuários vejam a mesma informação.
*   **Reset de Sync**: Caso uma sincronização seja interrompida por falha de rede ou timeout, o sistema permite o reset manual do estado.

---

## 🔐 Segurança e Boas Práticas

*   **Criptografia**: Os `api_tokens` do Jira são salvos no banco de dados após passarem por uma camada de criptografia no servidor. Eles nunca trafegam em texto puro no frontend.
*   **Read-Only JQL**: O filtro de busca de projetos é definido a nível de sistema para garantir que apenas os projetos pertinentes à operação sejam monitorados.
*   **Zero Placeholders**: Todos os dados exibidos são reais e provenientes da integração ativa.

---

## 🚀 Guia de Operação

1.  Acesse a página **Dados**.
2.  Valide o acesso para garantir que as credenciais estão corretas.
3.  Clique em **Sincronizar Global**.
4.  Aguarde o status "Sincronizado" (todos os usuários verão a atualização em tempo real).
5.  Acesse o **Dashboard** para analisar as métricas e corrigir inconsistências listadas na auditoria.

---

**Desenvolvido com excelência técnica pela equipe Antlia Dev.**