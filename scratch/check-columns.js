import { supabase } from '../lib/supabaseServer.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkColumns() {
  try {
    const { data, error } = await supabase
      .from('jira_issues')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Erro:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log('Colunas encontradas:', Object.keys(data[0]));
    } else {
      console.log('Tabela vazia, não foi possível determinar as colunas pelo select *');
      
      // Tentar via rpc ou query de sistema se necessário
      const { data: cols, error: err2 } = await supabase.rpc('get_table_columns', { table_name: 'jira_issues' });
      if (err2) {
        console.log('Dica: Para ver colunas de tabela vazia, você pode rodar uma query no SQL Editor do Supabase.');
      } else {
        console.log('Colunas (via RPC):', cols);
      }
    }
  } catch (err) {
    console.error('Falha catastrófica:', err.message);
  }
}

checkColumns();
