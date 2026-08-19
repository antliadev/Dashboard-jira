import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCrawfordHoursDashboard,
  capacityStatus,
  competenceFromStarted,
  validateCompetence
} from '../lib/hoursDashboardService.js';

test('competencia respeita America/Sao_Paulo na virada UTC', () => {
  assert.equal(competenceFromStarted('2026-09-01T01:30:00.000Z'), '2026-08');
});

test('faixas de consumo distinguem 80, 90, 100 e excedido', () => {
  assert.equal(capacityStatus(79 * 3600).level, 'normal');
  assert.equal(capacityStatus(80 * 3600).level, 'attention');
  assert.equal(capacityStatus(90 * 3600).level, 'critical');
  assert.equal(capacityStatus(100 * 3600).level, 'exhausted');
  assert.equal(capacityStatus(101 * 3600).level, 'exceeded');
  assert.equal(capacityStatus(101 * 3600).availableSeconds, 0);
  assert.equal(capacityStatus(101 * 3600).overageSeconds, 3600);
});

test('dashboard agrupa por competencia e epic/aplicacao sem solicitante', () => {
  const issues = [
    { issue_key: 'CRAWFORD-10', title: 'Integracao API' },
    { issue_key: 'CRAWFORD-11', title: 'Validar payload', parent_key: 'CRAWFORD-10', jira_url: 'https://example.test/browse/CRAWFORD-11' }
  ];
  const worklogs = [
    { worklog_id: '1', issue_key: 'CRAWFORD-11', author_name: 'Dev', description: 'Validacao', started_at: '2026-08-18T12:00:00.000Z', time_spent_seconds: 5400 },
    { worklog_id: '2', issue_key: 'CRAWFORD-11', author_name: 'Dev', description: '', started_at: '2026-09-18T12:00:00.000Z', time_spent_seconds: 3600 }
  ];
  const result = buildCrawfordHoursDashboard(worklogs, issues, '2026-08');
  assert.equal(result.capacity.usedHours, 1.5);
  assert.equal(result.capacity.availableHours, 98.5);
  assert.deepEqual(result.hoursByApplication, [{ application: 'Integracao API', name: 'Integracao API', seconds: 5400, hours: 1.5 }]);
  assert.equal(result.details[0].activityDescription, 'Validacao');
  assert.equal(result.monthlyConsumption.length, 2);
  assert.equal('hoursByRequester' in result, false);
  assert.equal('ticketsByRequester' in result, false);
  assert.equal(result.usedHours, 1.5);
  assert.equal(result.byApplication[0].name, 'Integracao API');
  assert.equal(result.monthlyHistory[0].usedHours, 1.5);
  assert.equal(result.entries[0].description, 'Validacao');
  assert.equal(result.entries[0].timeSeconds, 5400);
});

test('valida competencia da API', () => {
  assert.equal(validateCompetence('2026-08'), '2026-08');
  assert.throws(() => validateCompetence('08/2026'), /YYYY-MM/);
});
