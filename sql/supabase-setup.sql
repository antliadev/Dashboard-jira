-- Tabela para conexões do Jira no Supabase
-- Execute este SQL no editor SQL do Supabase

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

-- Habilitar RLS
ALTER TABLE jira_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Apenas service role pode acessar (backend)
CREATE POLICY "Service role only" ON jira_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);