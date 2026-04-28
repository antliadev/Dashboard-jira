# 🛠️ Guia de Infraestrutura e Deploy

Este documento contém as instruções para configurar o ambiente de produção na **Vercel** e o banco de dados no **Supabase**.

---

## 1. Variáveis de Ambiente (Vercel)

Configure as seguintes variáveis em *Settings > Environment Variables*:

### Supabase (Conexão obrigatória)
*   `SUPABASE_URL`: URL do seu projeto Supabase.
*   `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço (Service Role) para acesso administrativo.

### Segurança (Criptografia)
*   `JIRA_ENCRYPTION_KEY`: Uma chave aleatória de 32 caracteres (mínimo) usada para criptografar os tokens do Jira.

---

## 2. Configuração do Banco de Dados (Supabase)

Execute os scripts SQL abaixo no **SQL Editor** do Supabase para criar a estrutura necessária:

### Tabela de Configurações
```sql
CREATE TABLE IF NOT EXISTS jira_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT 'default',
  base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  jql TEXT NOT NULL,
  cache_ttl INTEGER DEFAULT 600000,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabela de Status de Sincronização
```sql
CREATE TABLE IF NOT EXISTS jira_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'idle', -- 'idle', 'running', 'synced', 'error'
  last_sync TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir registro inicial
INSERT INTO jira_sync_status (status) VALUES ('idle') ON CONFLICT DO NOTHING;
```

### Segurança de Banco (RLS)
```sql
ALTER TABLE jira_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE jira_sync_status ENABLE ROW LEVEL SECURITY;

-- Acesso apenas via Service Role (Backend)
CREATE POLICY "Service role only" ON jira_connections FOR ALL TO service_role USING (true);
CREATE POLICY "Service role only" ON jira_sync_status FOR ALL TO service_role USING (true);
```

---

## 3. Deploy na Vercel

1.  Conecte o repositório GitHub à Vercel.
2.  O sistema detectará automaticamente o `vite.config.js`.
3.  Configure o **Root Directory** como `./` (raiz).
4.  Certifique-se de que o comando de build seja `npm run build`.
5.  O comando de install deve ser `npm install`.

---

## 4. Verificação Pós-Deploy

1.  Acesse a URL gerada pela Vercel.
2.  Vá até a aba **Dados**.
3.  Preencha as credenciais do Jira.
4.  Clique em **Sincronizar Global**.
5.  Se os cards aparecerem no Kanban e Dashboard, a infraestrutura está 100% operacional.

---

**Equipe Antlia Dev - Qualidade e Segurança.**