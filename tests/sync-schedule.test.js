import assert from 'node:assert/strict';
import test from 'node:test';
import { isWithinAutoSyncSchedule } from '../lib/syncJobService.js';

test('agenda aceita intervalos de 30 minutos entre 06:00 e 18:00 BRT', () => {
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-20T09:00:00Z')), true);
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-20T09:30:00Z')), true);
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-20T21:00:00Z')), true);
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-20T21:30:00Z')), false);
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-20T08:30:00Z')), false);
  assert.equal(isWithinAutoSyncSchedule(new Date('2026-08-22T12:00:00Z')), false);
});
