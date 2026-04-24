/**
 * Debug JQL completo - testando todas as variações
 */
const baseUrl = 'https://antliaprojetos.atlassian.net';
const email = 'pedro.fernandes@antlia.com.br';
const token = 'SEU_TOKEN_AQUI';

const credentials = Buffer.from(`${email}:${token}`).toString('base64');
const authHeader = `Basic ${credentials}`;

// JQL exatamente como especificada
const DEFAULT_JQL = 'project in (BLCASH, BB, CEP, CTR, CVM175, DTVSLI, ETF, PGINT, SDDS2, SDDSF2, BNPTD, BTA, MAR, P1) AND status is not EMPTY ORDER BY project ASC, status ASC, assignee ASC, updated DESC';

async function testSearch() {
  console.log('=== Testando POST /rest/api/3/search/jql ===');
  console.log('JQL:', DEFAULT_JQL);
  console.log('Auth:', authHeader.substring(0, 30) + '...');
  console.log('');
  
  const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jql: DEFAULT_JQL,
      maxResults: 100,
      startAt: 0,
      fields: [
        'summary',
        'status',
        'assignee',
        'priority',
        'updated',
        'created',
        'project'
      ]
    })
  });
  
  console.log('Response Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  
  const data = await res.json();
  
  console.log('');
  console.log('=== RESULTADO ===');
  console.log('keys:', Object.keys(data));
  console.log('total:', data.total);
  console.log('issues.length:', data.issues?.length);
  console.log('isLast:', data.isLast);
  console.log('nextPageToken:', data.nextPageToken);
  
  if (data.issues && data.issues.length > 0) {
    console.log('');
    console.log('Primeiro issue:', data.issues[0].key);
    console.log('Projeto:', data.issues[0].fields?.project?.key);
    console.log('Status:', data.issues[0].fields?.status?.name);
  }
  
  if (data.errorMessages) {
    console.log('Errors:', data.errorMessages);
  }
  if (data.errors) {
    console.log('Errors obj:', data.errors);
  }
}

testSearch().catch(console.error);