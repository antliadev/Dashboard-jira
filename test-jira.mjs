/**
 * Teste de credenciais Jira
 */
const baseUrl = 'https://antliaprojetos.atlassian.net';
const email = 'pedro.fernandes@antlia.com.br';
const token = 'ATATT3xFfGF0rjOatMqs6amudMlXSo1Tv4PSjjRH6ruBUOK5srlEDEqsJ8Hl43azr9ke3GWQDG2JIuRn4U0X27KPs60IS3pfxDBP08Kf-EgT5YQP2VptiyPt0NWmawPyy_ZHoQD-hgDYDm_iPSTURU7d2mozFkZAqTSu4_zuG7uYEr7itl8vYxQ=DAFCC982';

const credentials = Buffer.from(`${email}:${token}`).toString('base64');
const authHeader = `Basic ${credentials}`;

console.log('Testing Jira connection...');
console.log('URL:', baseUrl);
console.log('Email:', email);
console.log('Auth:', authHeader.substring(0, 50) + '...');

fetch(`${baseUrl}/rest/api/3/myself`, {
  method: 'GET',
  headers: {
    'Authorization': authHeader,
    'Accept': 'application/json'
  }
})
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('Success!', JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.log('Error:', err.message);
  });