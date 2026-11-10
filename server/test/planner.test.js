import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ??= 'test';
process.env.DATABASE_URL ??= 'mysql://u:p@localhost:3306/test';
const { computeDailyPlan, reservedBills } = await import('../src/services/planner.js');
const { alertLevel } = await import('../src/services/alerts.js');
const { isUnusual } = await import('../src/services/maintenance.js');

const cat = (over = {}) => ({ categoryId: 1, name: 'Food', limitCents: 0, spentBeforeCents: 0, spentTodayCents: 0, reservedCents: 0, ...over });

test('$600 left with 20 days to go gives $30 a day', () => {
  const plan = computeDailyPlan({ daysLeft: 20, categories: [cat({ limitCents: 100000, spentBeforeCents: 40000 })] });
  assert.equal(plan.dailyLimitCents, 3000);
  assert.equal(plan.leftoverCents, 3000);
  assert.equal(plan.status, 'on_track');
});

test('spending $15 of $30 leaves $15 and raises tomorrow', () => {
  const plan = computeDailyPlan({ daysLeft: 20, categories: [cat({ limitCents: 100000, spentBeforeCents: 40000, spentTodayCents: 1500 })] });
  assert.equal(plan.leftoverCents, 1500);
  assert.equal(plan.tomorrowLimitCents, Math.floor(58500 / 19));
  // Sweeping the leftover into savings uses it up today and tomorrow goes back to ~$30.
  const swept = computeDailyPlan({ daysLeft: 20, categories: [cat({ limitCents: 100000, spentBeforeCents: 40000, spentTodayCents: 1500 })], sweptTodayCents: 1500 });
  assert.equal(swept.leftoverCents, 0);
  assert.equal(swept.tomorrowLimitCents, 3000);
});

test('upcoming bills and earlier sweeps are set aside', () => {
  const plan = computeDailyPlan({
    daysLeft: 10,
    categories: [cat({ limitCents: 30000, spentBeforeCents: 5000, reservedCents: 5000 })],
    sweptBeforeCents: 2000,
    unbudgetedBeforeCents: 1000,
  });
  assert.equal(plan.poolCents, 17000);
  assert.equal(plan.dailyLimitCents, 1700);
});

test('category shares add up to the daily limit and overspending is flagged', () => {
  const plan = computeDailyPlan({
    daysLeft: 3,
    categories: [
      cat({ categoryId: 1, limitCents: 10000 }),
      cat({ categoryId: 2, limitCents: 5000, spentTodayCents: 6000 }),
      cat({ categoryId: 3, limitCents: 1000, spentBeforeCents: 4000 }), // already overspent: contributes nothing
    ],
  });
  assert.equal(plan.categories.reduce((s, c) => s + c.suggestedCents, 0), plan.dailyLimitCents);
  assert.equal(plan.categories[2].suggestedCents, 0);
  assert.equal(plan.status, 'over');
  assert.equal(plan.overspentCents, 6000 - plan.dailyLimitCents);
});

test('never negative, never divides by zero', () => {
  const plan = computeDailyPlan({ daysLeft: 0, categories: [cat({ limitCents: 1000, spentBeforeCents: 5000 })] });
  assert.equal(plan.dailyLimitCents, 0);
  assert.equal(plan.tomorrowLimitCents, 0);
});

test('reservedBills counts every occurrence left in the month', () => {
  const d = (iso) => new Date(`${iso}T00:00:00Z`);
  const { byCategory, bills } = reservedBills(
    [
      { id: 1, categoryId: 7, amount: '10.00', frequency: 'weekly', nextDueDate: d('2026-11-10'), endDate: null, description: 'Laundry' },
      { id: 2, categoryId: 8, amount: '400.00', frequency: 'monthly', nextDueDate: d('2026-12-01'), endDate: null, description: 'Rent' },
    ],
    '2026-11-10',
    '2026-12-01',
  );
  assert.equal(byCategory.get(7), 3000); // 10th, 17th, 24th
  assert.equal(byCategory.has(8), false); // next month
  assert.equal(bills.length, 3);
});

test('alertLevel: highest threshold reached, "over" only when really over', () => {
  const t = [50, 80, 100];
  assert.equal(alertLevel(12499, 25000, t), null);
  assert.deepEqual(alertLevel(12500, 25000, t), { level: 50 });
  assert.deepEqual(alertLevel(21250, 25000, t), { level: 80 });
  assert.deepEqual(alertLevel(25000, 25000, t), { level: 100 });
  assert.deepEqual(alertLevel(25001, 25000, t), { level: 'over' });
  assert.deepEqual(alertLevel(25001, 25000, []), { level: 'over' }); // even with all thresholds off
  assert.equal(alertLevel(500, 0, t), null);
});

test('isUnusual needs both +35% and +$10 over the weekly average', () => {
  assert.equal(isUnusual(5000, 0), null);
  assert.equal(isUnusual(5000, 16000), null); // avg 40 -> +25%
  assert.equal(isUnusual(1400, 2000), null); // +180% but less than $10 more
  assert.deepEqual(isUnusual(5400, 16000), { percent: 35, weeklyAverageCents: 4000 });
});
