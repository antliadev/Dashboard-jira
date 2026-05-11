import { supabase } from '../lib/supabaseServer.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkStatuses() {
  try {
    const { data, error } = await supabase
      .from('jira_issues')
      .select('status_name');

    if (error) {
      console.error('Erro:', error.message);
      return;
    }

    const statuses = [...new Set(data.map(i => i.status_name))];
    console.log('Status únicos encontrados no banco:');
    console.log(statuses);

    // Contagem por status
    const counts = data.reduce((acc, i) => {
      acc[i.status_name] = (acc[i.status_name] || 0) + 1;
      return acc;
    }, {});
    console.log('\nContagem por status:', counts);
  } catch (err) {
    console.error('Falha:', err.message);
  }
}

checkStatuses();
