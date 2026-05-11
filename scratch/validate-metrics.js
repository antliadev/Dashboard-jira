// Mock localStorage for Node
global.localStorage = {
  getItem: () => null,
  setItem: () => null,
  removeItem: () => null,
  clear: () => null
};

import { dataService } from '../src/data/data-service.js';

async function test() {
  console.log('Iniciando teste de métricas...');
  try {
    const mockUsers = [{ id: 'u1', displayName: 'Teste 1' }];
    const mockCards = [
      { id: 'c1', title: 'Task 1', assigneeId: 'u1', status: 'Done', projectId: 'p1' },
      { id: 'c2', title: 'Task 2', assigneeId: 'u1', status: 'In Progress', projectId: 'p1' },
      { id: 'c3', title: 'Task 3', assigneeId: 'u1', status: 'Completed', projectId: 'p1' },
      { id: 'c4', title: 'Task 4', assigneeId: 'u1', status: 'Cancelado', projectId: 'p1' }
    ];
    const mockProjects = [{ id: 'p1', key: 'TEST', name: 'Teste' }];
    
    dataService.importData(mockProjects, mockCards, mockUsers);
    
    const users = dataService.getUsersRanked();
    
    console.log(`Total de usuários encontrados: ${users.length}`);
    
    users.forEach(u => {
      console.log(`\nAnalista: ${u.displayName}`);
      console.log(`- Total: ${u.stats.total}`);
      console.log(`- Andamento: ${u.stats.inProgress}`);
      console.log(`- Concluídos: ${u.stats.done}`);
      
      // Validação
      // Total = 4
      // Done = 2 ('Done', 'Completed')
      // Canceled = 1 ('Cancelado')
      // InProgress = 4 - (2 + 1) = 1
      if (u.stats.total === 4 && u.stats.done === 2 && u.stats.inProgress === 1) {
        console.log('✅ Lógica de cálculo VALIDADA com sucesso!');
      } else {
        console.error(`❌ Erro na lógica de cálculo! Esperado Done=2, InProgress=1. Obtido Done=${u.stats.done}, InProgress=${u.stats.inProgress}`);
      }
    });
  } catch (err) {
    console.error('Erro no teste:', err);
  }
}

test();
