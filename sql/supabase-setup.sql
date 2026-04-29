-- ============================================================
-- Jira Dashboard — Schema Supabase
-- Execute este SQL no editor SQL do Supabase
-- ============================================================

-- Tabela de conexões do Jira (credenciais criptografadas)
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

-- Tabela de issues sincronizadas do Jira
-- Chave de upsert: issue_id (ID numérico do Jira) — único e imutável
CREATE TABLE IF NOT EXISTS jira_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id TEXT NOT NULL UNIQUE,     -- ID numérico do Jira (ex: "10042") — chave de upsert
  issue_key TEXT NOT NULL,           -- Chave legível (ex: "BLCASH-123")
  title TEXT NOT NULL DEFAULT '',
  status_id TEXT,
  status_name TEXT NOT NULL DEFAULT '',
  status_category TEXT,
  project_id TEXT,
  project_key TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  project_avatar TEXT,
  type_id TEXT,
  type_name TEXT NOT NULL DEFAULT 'Task',
  type_icon TEXT,
  priority_id TEXT,
  priority_name TEXT,
  priority_icon TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  assignee_avatar TEXT,
  assignee_email TEXT,
  reporter_id TEXT,
  reporter_name TEXT,
  reporter_avatar TEXT,
  creator_id TEXT,
  creator_name TEXT,
  creator_avatar TEXT,
  labels JSONB DEFAULT '[]'::JSONB,
  components JSONB DEFAULT '[]'::JSONB,
  fix_versions JSONB DEFAULT '[]'::JSONB,
  parent_key TEXT,
  parent_title TEXT,
  jira_created_at TIMESTAMPTZ,
  jira_updated_at TIMESTAMPTZ,
  jira_resolved_at TIMESTAMPTZ,
  due_date DATE,
  story_points INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),    -- quando foi salvo/atualizado no banco
  created_at TIMESTAMPTZ DEFAULT now()   -- primeira vez que entrou no banco
);

-- Índices para performance nas queries mais frequentes
CREATE INDEX IF NOT EXISTS idx_jira_issues_project_key ON jira_issues(project_key);
CREATE INDEX IF NOT EXISTS idx_jira_issues_status_name ON jira_issues(status_name);
CREATE INDEX IF NOT EXISTS idx_jira_issues_assignee_id ON jira_issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_jira_issues_synced_at ON jira_issues(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_jira_issues_priority_name ON jira_issues(priority_name);
CREATE INDEX IF NOT EXISTS idx_jira_issues_type_name ON jira_issues(type_name);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE jira_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE jira_issues ENABLE ROW LEVEL SECURITY;

-- Apenas service_role acessa — nunca exposto ao frontend diretamente
DROP POLICY IF EXISTS "Service role only - connections" ON jira_connections;
CREATE POLICY "Service role only - connections" ON jira_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only - issues" ON jira_issues;
CREATE POLICY "Service role only - issues" ON jira_issues
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Função para atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_jira_connections_updated_at ON jira_connections;
CREATE TRIGGER set_jira_connections_updated_at
  BEFORE UPDATE ON jira_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();