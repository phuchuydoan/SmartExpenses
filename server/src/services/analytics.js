// Reports: daily / weekly / monthly spending, category breakdown, comparisons.
import { prisma } from '../db.js';
import { toCents, percentOf } from '../lib/money.js';
import { toDate, toIso, monthRange, addMonths, addDays, daysInMonth, weekStart, monthOf } from '../lib/dates.js';
import { expensesByCategory, totalsBetween, budgetStatus } from './finance.js';

async function categoryLookup(userId) {
  const categories = await prisma.category.findMany({ where: { userId } });
  return new Map(categories.map((c) => [c.id, c]));
}

export async function categoryBreakdown(userId, start, end, lookup) {
  const categories = lookup ?? (await categoryLookup(userId));
  const spent = await expensesByCategory(userId, start, end);
  const total = [...spent.values()].reduce((a, b) => a + b, 0);
  return [...spent.entries()]
    .map(([categoryId, cents]) => {
      const category = categories.get(categoryId);
      return {
        categoryId: categoryId || null,
        name: category?.name ?? 'Uncategorised',
        color: category?.color ?? '#94a3b8',
        icon: category?.icon ?? 'tag',
        amountCents: cents,
        percent: total > 0 ? Math.round((cents * 1000) / total) / 10 : 0,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function analytics(userId, month, today) {
  const { start, end } = monthRange(month);
  const previousMonth = addMonths(month, -1);
  const previous = monthRange(previousMonth);
  const lookup = await categoryLookup(userId);

  // --- daily spending for the month, with running total
  const dailyRows = await prisma.transaction.groupBy({
    by: ['date'],
    where: { userId, type: 'expense', date: { gte: toDate(start), lt: toDate(end) } },
    _sum: { amount: true },
  });
  const byDay = new Map(dailyRows.map((r) => [toIso(r.date), toCents(r._sum.amount)]));
  const status = await budgetStatus(userId, month);
  const days = daysInMonth(month);
  const lastDay = monthOf(today) === month ? Number(today.slice(8, 10)) : monthOf(today) > month ? days : 0;
  let running = 0;
  const daily = [];
  for (let d = 1; d <= days; d += 1) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const cents = byDay.get(date) ?? 0;
    running += cents;
    daily.push({
      date,
      day: d,
      expenseCents: cents,
      // Only draw the cumulative line up to today.
      cumulativeCents: d <= lastDay ? running : null,
      budgetPaceCents: status ? Math.round((status.totalLimitCents * d) / days) : null,
    });
  }

  // --- last 8 weeks (Monday-Sunday)
  const firstWeek = addDays(weekStart(today), -7 * 7);
  const weeklyRows = await prisma.transaction.findMany({
    where: { userId, type: 'expense', date: { gte: toDate(firstWeek), lte: toDate(today) } },
    select: { date: true, amount: true },
  });
  const weekly = [];
  for (let i = 0; i < 8; i += 1) weekly.push({ weekStart: addDays(firstWeek, i * 7), expenseCents: 0 });
  for (const row of weeklyRows) {
    const bucket = weekly.find((w) => w.weekStart === weekStart(toIso(row.date)));
    if (bucket) bucket.expenseCents += toCents(row.amount);
  }

  // --- last 6 months: income vs expenses vs savings
  const monthly = [];
  for (let i = 5; i >= 0; i -= 1) {
    const m = addMonths(month, -i);
    const range = monthRange(m);
    const totals = await totalsBetween(userId, range.start, range.end);
    monthly.push({
      month: m,
      incomeCents: totals.income,
      expenseCents: totals.expense,
      savingsCents: totals.savings,
      netCents: totals.income - totals.expense - totals.savings,
    });
  }

  // --- category breakdown and month-over-month comparison
  const [categories, previousCategories] = await Promise.all([
    categoryBreakdown(userId, start, end, lookup),
    categoryBreakdown(userId, previous.start, previous.end, lookup),
  ]);
  const previousById = new Map(previousCategories.map((c) => [c.categoryId, c.amountCents]));
  const ids = new Set([...categories.map((c) => c.categoryId), ...previousCategories.map((c) => c.categoryId)]);
  const comparison = [...ids]
    .map((categoryId) => {
      const current = categories.find((c) => c.categoryId === categoryId);
      const before = previousCategories.find((c) => c.categoryId === categoryId);
      const currentCents = current?.amountCents ?? 0;
      const previousCents = previousById.get(categoryId) ?? 0;
      return {
        categoryId,
        name: (current ?? before).name,
        color: (current ?? before).color,
        currentCents,
        previousCents,
        changeCents: currentCents - previousCents,
        changePercent: previousCents > 0 ? Math.round(((currentCents - previousCents) / previousCents) * 100) : null,
      };
    })
    .sort((a, b) => b.currentCents - a.currentCents);

  const thisMonth = monthly[monthly.length - 1];
  const lastMonth = monthly[monthly.length - 2];

  // Fair comparison while the month is still running: same number of days last month.
  let samePointCents = null;
  if (monthOf(today) === month) {
    const cutoffDay = Math.min(lastDay, daysInMonth(previousMonth));
    const cutoff = addDays(`${previousMonth}-${String(cutoffDay).padStart(2, '0')}`, 1);
    samePointCents = (await totalsBetween(userId, previous.start, cutoff)).expense;
  }

  return {
    month,
    summary: {
      incomeCents: thisMonth.incomeCents,
      expenseCents: thisMonth.expenseCents,
      savingsCents: thisMonth.savingsCents,
      netCents: thisMonth.netCents,
      savingsRate: thisMonth.incomeCents > 0 ? percentOf(thisMonth.savingsCents, thisMonth.incomeCents) : 0,
      previousExpenseCents: lastMonth.expenseCents,
      previousSamePointCents: samePointCents,
      averageDailyCents: lastDay > 0 ? Math.round(thisMonth.expenseCents / lastDay) : 0,
      topCategory: categories[0]?.name ?? null,
    },
    daily,
    weekly,
    monthly,
    categories,
    comparison,
  };
}
