// Daily Spending Planner: "how much can I spend today?"
import { prisma } from '../db.js';
import { toCents, allocate } from '../lib/money.js';
import { toDate, toIso, monthOf, monthRange, daysInMonth, addDays, nextOccurrence } from '../lib/dates.js';
import { budgetStatus } from './finance.js';

/**
 * Pure calculation (unit tested). All amounts in cents.
 *
 * pool        = what is left of the flexible budget at the start of today,
 *               after setting money aside for bills still due this month
 *               and for unspent allowance already moved to savings.
 * dailyLimit  = pool / days left (today included)
 */
export function computeDailyPlan({
  daysLeft,
  categories, // [{ categoryId, name, limitCents, spentBeforeCents, spentTodayCents, reservedCents }]
  unbudgetedBeforeCents = 0,
  unbudgetedTodayCents = 0,
  sweptBeforeCents = 0,
  sweptTodayCents = 0,
}) {
  const days = Math.max(1, daysLeft);
  const available = categories.map((c) => Math.max(0, c.limitCents - c.spentBeforeCents - c.reservedCents));
  const availableTotal = available.reduce((a, b) => a + b, 0);
  const poolCents = Math.max(0, availableTotal - sweptBeforeCents - unbudgetedBeforeCents);
  const dailyLimitCents = Math.floor(poolCents / days);

  const shares = allocate(dailyLimitCents, available);
  const spentTodayCents = categories.reduce((sum, c) => sum + c.spentTodayCents, 0) + unbudgetedTodayCents;
  const usedTodayCents = spentTodayCents + sweptTodayCents;
  const leftoverCents = Math.max(0, dailyLimitCents - usedTodayCents);
  const overspentCents = Math.max(0, spentTodayCents - dailyLimitCents);

  const tomorrowLimitCents = days > 1 ? Math.floor(Math.max(0, poolCents - usedTodayCents) / (days - 1)) : 0;

  let status = 'on_track';
  if (spentTodayCents > dailyLimitCents) status = 'over';
  else if (dailyLimitCents > 0 && spentTodayCents * 100 >= dailyLimitCents * 80) status = 'near_limit';

  return {
    daysLeft: days,
    poolCents,
    dailyLimitCents,
    spentTodayCents,
    sweptTodayCents,
    leftoverCents,
    overspentCents,
    tomorrowLimitCents,
    reservedCents: categories.reduce((sum, c) => sum + c.reservedCents, 0),
    status,
    categories: categories.map((c, i) => ({
      categoryId: c.categoryId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      suggestedCents: shares[i],
      spentTodayCents: c.spentTodayCents,
      monthRemainingCents: c.limitCents - c.spentBeforeCents - c.spentTodayCents,
      reservedCents: c.reservedCents,
    })),
    unbudgetedTodayCents,
  };
}

/** Total of each recurring expense's occurrences in [fromIso, endIso), by category. */
export function reservedBills(recurring, fromIso, endIso) {
  const byCategory = new Map();
  const bills = [];
  for (const r of recurring) {
    let due = toIso(r.nextDueDate);
    const stop = r.endDate ? toIso(r.endDate) : null;
    for (let i = 0; i < 40 && due < endIso; i += 1) {
      if (stop && due > stop) break;
      if (due >= fromIso) {
        const cents = toCents(r.amount);
        byCategory.set(r.categoryId ?? 0, (byCategory.get(r.categoryId ?? 0) ?? 0) + cents);
        bills.push({ recurringId: r.id, description: r.description, date: due, amountCents: cents, categoryId: r.categoryId });
      }
      due = nextOccurrence(due, r.frequency);
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));
  return { byCategory, bills };
}

/** Daily plan for `today` (ISO date). Returns null if the month has no budget. */
export async function dailyPlan(userId, today) {
  const month = monthOf(today);
  const status = await budgetStatus(userId, month);
  if (!status) return null;

  const { start, end } = monthRange(month);
  const tomorrow = addDays(today, 1);
  const [todayRows, sweeps, recurring, categories] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { userId, type: 'expense', date: toDate(today) },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { userId, source: 'sweep', date: { gte: toDate(start), lt: toDate(end) } },
      select: { amount: true, date: true },
    }),
    prisma.recurringTransaction.findMany({ where: { userId, active: true, type: 'expense' } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, isFixed: true } }),
  ]);

  const spentToday = new Map(todayRows.map((r) => [r.categoryId ?? 0, toCents(r._sum.amount)]));
  // Bills due from tomorrow on are set aside; a bill due today counts once it is paid.
  const { byCategory: reserved, bills } = reservedBills(recurring, tomorrow, end);
  const fixedIds = new Set(categories.filter((c) => c.isFixed).map((c) => c.id));

  const flexible = status.categories.filter((c) => !c.isFixed);
  const budgetedIds = new Set(status.categories.map((c) => c.categoryId));

  // Spending in non-fixed categories that have no budget line still uses up money.
  let unbudgetedTodayCents = 0;
  for (const [categoryId, cents] of spentToday) {
    if (!budgetedIds.has(categoryId) && !fixedIds.has(categoryId)) unbudgetedTodayCents += cents;
  }
  // status.unbudgetedSpentCents covers the whole month so far, fixed categories included;
  // recompute for flexible categories only.
  const monthUnbudgeted = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, type: 'expense', date: { gte: toDate(start), lt: toDate(today) } },
    _sum: { amount: true },
  });
  let unbudgetedBeforeCents = 0;
  for (const row of monthUnbudgeted) {
    const categoryId = row.categoryId ?? 0;
    if (!budgetedIds.has(categoryId) && !fixedIds.has(categoryId)) unbudgetedBeforeCents += toCents(row._sum.amount);
  }

  let sweptBeforeCents = 0;
  let sweptTodayCents = 0;
  for (const s of sweeps) {
    if (toIso(s.date) === today) sweptTodayCents += toCents(s.amount);
    else if (toIso(s.date) < today) sweptBeforeCents += toCents(s.amount);
  }

  const dayOfMonth = Number(today.slice(8, 10));
  const plan = computeDailyPlan({
    daysLeft: daysInMonth(month) - dayOfMonth + 1,
    categories: flexible.map((c) => {
      const todayCents = spentToday.get(c.categoryId) ?? 0;
      return {
        categoryId: c.categoryId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        limitCents: c.limitCents,
        spentBeforeCents: c.spentCents - todayCents, // future-dated rows are rare; treated as spent
        spentTodayCents: todayCents,
        reservedCents: reserved.get(c.categoryId) ?? 0,
      };
    }),
    unbudgetedBeforeCents,
    unbudgetedTodayCents,
    sweptBeforeCents,
    sweptTodayCents,
  });

  return { date: today, month, ...plan, upcomingBills: bills.slice(0, 8) };
}
