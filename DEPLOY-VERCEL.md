# Configuração para Deploy na Vercel

## Variáveis de Ambiente (Settings > Environment Variables)

### Supabase (OBRIGATÓRIO)
```
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY_AQUI
```

### Criptografia (OBRIGATÓRIO)
```
# Gere uma chave aleatória de 32 bytes para produção
JIRA_ENCRYPTION_KEY=SUA_CHAVE_AQUI_MINIMO_32_BYTES
```

### Jira (OPCIONAL - pode configurar via página Dados)
```
JIRA_CACHE_TTL=600000
```

---

## Criar Tabela no Supabase

Execute o SQL abaixo no Editor SQL do Supabase:

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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE jira_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON jira_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

## Fluxo de Uso

1. Deploy na Vercel
2. Configure as variáveis de ambiente acima
3. Acesse a página Dados
4. Preencha as credenciais do Jira
5. Clique em Salvar Configuração
6. As credenciais serão criptografadas e salvas no Supabase
7. Teste a conexão
8. Sincronize os dados