import fs from 'fs';

const file = './src/data/data-service.js';
let content = fs.readFileSync(file, 'utf8');

console.log('Tamanho original:', content.length);

const isCanceledFunc = `
  isCanceledStatus(statusName) {
    if (!statusName) return false;
    const name = this._stripDiacritics(statusName.toLowerCase());
    return (
      name.includes('cancel') ||
      name.includes('rejeit') ||
      name.includes('abandon') ||
      name.includes('abort') ||
      name.includes('descontinuado') ||
      name.includes('ignora')
    );
  }
`;

// Inserir antes do último } da classe
// Procuramos o padrão final do arquivo
const match = content.match(/}\s*export const dataService = new DataService\(\);/);
if (match) {
    console.log('Match encontrado para inserção!');
    content = content.replace(match[0], isCanceledFunc + '\n}\n\nexport const dataService = new DataService();');
} else {
    console.log('Match NÃO encontrado. Tentando alternativa...');
    content += "\n// Patch fallback\nDataService.prototype.isCanceledStatus = function(statusName) { \n  if (!statusName) return false;\n  const name = this._stripDiacritics(statusName.toLowerCase());\n  return name.includes('cancel') || name.includes('rejeit');\n};";
}

// Corrigir isDoneStatus
content = content.replace(/name\.includes\('resolved'\)/, "name.includes('resolved') || name.includes('completed') || name.includes('concluida')");

fs.writeFileSync(file, content, 'utf8');
console.log('Patch finalizado. Novo tamanho:', content.length);
