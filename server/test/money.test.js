import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, centsToDecimal, percentOf, allocate } from '../src/lib/money.js';

test('toCents is exact for decimals that break floats', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), 30);
  assert.equal(toCents(6.5), 650);
  assert.equal(toCents('1234.56'), 123456);
  assert.equal(toCents('-12.3'), -1230);
  assert.equal(toCents(null), 0);
  assert.equal(toCents({ toString: () => '19.99' }), 1999); // Prisma Decimal
});

test('fromCents / centsToDecimal round-trip', () => {
  assert.equal(fromCents(650), 6.5);
  assert.equal(centsToDecimal(650), '6.50');
  assert.equal(centsToDecimal(-5), '-0.05');
});

test('percentOf rounds down so 100% only means the limit is really reached', () => {
  assert.equal(percentOf(21250, 25000), 85);
  assert.equal(percentOf(24999, 25000), 99);
  assert.equal(percentOf(25000, 25000), 100);
  assert.equal(percentOf(0, 0), 0);
});

test('allocate always adds up to the total', () => {
  const parts = allocate(10000, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
  assert.deepEqual(allocate(1000, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(3000, [15, 5, 5, 5]), [1500, 500, 500, 500]);
});
