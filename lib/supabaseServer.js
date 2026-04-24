/**
 * supabaseServer.js - Cliente Supabase para backend
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar variáveis de ambiente
if (!supabaseUrl) {
  console.error('[Supabase] ERRO: SUPABASE_URL não configurada');
}

if (!supabaseServiceKey) {
  console.error('[Supabase] ERRO: SUPABASE_SERVICE_ROLE_KEY não configurada');
}

export const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

export const isConfigured = !!supabase;

// Helper para verificar configuração
export function checkSupabaseConfig() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      configured: false,
      error: 'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    };
  }
  return { configured: true };
}