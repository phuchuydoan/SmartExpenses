import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayIn, addDays, addMonths, daysInMonth, monthRange, weekStart, nextOccurrence, isIsoDate } from '../src/lib/dates.js';

test('todayIn uses the user timezone, not the server clock', () => {
  const instant = new Date('2026-11-10T02:30:00Z');
  assert.equal(todayIn('America/New_York', instant), '2026-11-09');
  assert.equal(todayIn('Asia/Ho_Chi_Minh', instant), '2026-11-10');
  assert.equal(todayIn('Not/AZone', instant), '2026-11-10'); // falls back to UTC
});

test('month helpers', () => {
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // a Monday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday belongs to the same week
});

test('nextOccurrence keeps month-end bills on a valid day', () => {
  assert.equal(nextOccurrence('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextOccurrence('2026-11-09', 'weekly'), '2026-11-16');
  assert.equal(nextOccurrence('2026-11-09', 'biweekly'), '2026-11-23');
  assert.equal(nextOccurrence('2028-02-29', 'yearly'), '2029-02-28');
});

test('isIsoDate rejects impossible dates', () => {
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2026-2-3'), false);
  assert.equal(isIsoDate('2026-02-03'), true);
});
