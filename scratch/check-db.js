import { supabase } from '../lib/supabaseServer.js';

async function check() {
  console.log('Checking Supabase connection...');
  try {
    const { data: issues, error: issuesError, count } = await supabase
      .from('jira_issues')
      .select('*', { count: 'exact', head: true });
    
    if (issuesError) {
      console.error('Error fetching jira_issues:', issuesError);
    } else {
      console.log('jira_issues count:', count);
    }

    const { data: jobs, error: jobsError } = await supabase
      .from('jira_sync_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (jobsError) {
      console.error('Error fetching jira_sync_jobs:', jobsError);
    } else {
      console.log('Latest sync job:', jobs[0]?.status || 'none');
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

check();
