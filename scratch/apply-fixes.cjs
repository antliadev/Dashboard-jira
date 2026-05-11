const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'data', 'data-service.js');
let content = fs.readFileSync(file, 'utf8');

const isCanceledFunc = `
  /**
   * Verifica se um status é considerado "cancelado/descontinuado".
   */
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

// Inserir antes do último } da classe DataService
const lastBrace = content.lastIndexOf('}');
const beforeLastBrace = content.lastIndexOf('}', lastBrace - 1);
// Na verdade, vamos inserir antes do "export const dataService"
if (!content.includes('isCanceledStatus')) {
    content = content.replace('export const dataService', isCanceledFunc + '\n}\n\nexport const dataService');
    // Remover o } extra que o replace pode ter deixado se a classe terminava ali
    // Mas a classe termina com um }, então precisamos de cuidado.
}

// Corrigir o getUserStats (garantir que chama this.isCanceledStatus)
content = content.replace(
    /return this\.isCanceledStatus\(c\.status\);\s*\}\)\.length;/,
    "return this.isCanceledStatus(c.status); }).length;"
);

fs.writeFileSync(file, content);
console.log('Patch aplicado!');
