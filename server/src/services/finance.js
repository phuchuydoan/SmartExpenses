// Core money queries. Every number shown in the app (and every number handed
// to the AI) is computed here from MySQL - never by the language model.
import { prisma } from '../db.js';
import { toCents, fromCents, percentOf } from '../lib/money.js';
import { toDate, monthRange } from '../lib/dates.js';

/** Totals per transaction type for [start, end). Returns cents. */
export async function totalsBetween(userId, start, end) {
  const rows = await prisma.transaction.groupBy({
    by: ['type'],
    where: { userId, date: { gte: toDate(start), lt: toDate(end) } },
    _sum: { amount: true },
    _count: true,
  });
  const out = { income: 0, expense: 0, savings: 0, count: 0 };
  for (const row of rows) {
    out[row.type] = toCents(row._sum.amount);
    out.count += row._count;
  }
  return out;
}

/** Map of categoryId -> expense cents for [start, end). Key 0 = uncategorised. */
export async function expensesByCategory(userId, start, end) {
  const rows = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { userId, type: 'expense', date: { gte: toDate(start), lt: toDate(end) } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.categoryId ?? 0, toCents(r._sum.amount)]));
}

export async function accountBalances(userId) {
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ where: { userId, archived: false }, orderBy: { id: 'asc' } }),
    prisma.transaction.groupBy({ by: ['accountId', 'type'], where: { userId }, _sum: { amount: true } }),
  ]);
  return accounts.map((account) => {
    let cents = toCents(account.openingBalance);
    for (const row of sums) {
      if (row.accountId !== account.id) continue;
      const amount = toCents(row._sum.amount);
      cents += row.type === 'income' ? amount : -amount;
    }
    return { id: account.id, name: account.name, type: account.type, balanceCents: cents };
  });
}

/** Saved amount per goal (sum of its contributions), in cents. */
export async function goalTotals(userId) {
  const rows = await prisma.transaction.groupBy({
    by: ['goalId'],
    where: { userId, type: 'savings', goalId: { not: null } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.goalId, toCents(r._sum.amount)]));
}

/**
 * Budget vs. actual spending for one month. Returns null when the user has
 * not created a budget for that month. All amounts in cents.
 */
export async function budgetStatus(userId, month) {
  const budget = await prisma.budget.findUnique({
    where: { userId_month: { userId, month } },
    include: { categories: { include: { category: true }, orderBy: { id: 'asc' } } },
  });
  if (!budget) return null;

  const { start, end } = monthRange(month);
  const [spent, totals] = await Promise.all([
    expensesByCategory(userId, start, end),
    totalsBetween(userId, start, end),
  ]);

  const budgetedIds = new Set();
  const categories = budget.categories.map((bc) => {
    budgetedIds.add(bc.categoryId);
    const limitCents = toCents(bc.limit);
    const spentCents = spent.get(bc.categoryId) ?? 0;
    return {
      id: bc.id,
      categoryId: bc.categoryId,
      name: bc.category.name,
      icon: bc.category.icon,
      color: bc.category.color,
      isFixed: bc.category.isFixed,
      limitCents,
      spentCents,
      remainingCents: limitCents - spentCents,
      percentUsed: percentOf(spentCents, limitCents),
    };
  });

  const totalLimitCents = categories.reduce((sum, c) => sum + c.limitCents, 0);
  let unbudgetedSpentCents = 0;
  for (const [categoryId, cents] of spent) if (!budgetedIds.has(categoryId)) unbudgetedSpentCents += cents;

  const incomeCents = toCents(budget.income);
  const savingsTargetCents = toCents(budget.savingsTarget);
  return {
    id: budget.id,
    month,
    incomeCents,
    savingsTargetCents,
    totalLimitCents,
    totalSpentCents: totals.expense,
    remainingCents: totalLimitCents - totals.expense,
    percentUsed: percentOf(totals.expense, totalLimitCents),
    unallocatedCents: incomeCents - savingsTargetCents - totalLimitCents,
    unbudgetedSpentCents,
    savedCents: totals.savings,
    actualIncomeCents: totals.income,
    categories,
  };
}

/** Converts every `...Cents` key (deeply) to a plain money number for the API. */
export function present(value) {
  if (Array.isArray(value)) return value.map(present);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.endsWith('Cents') && typeof v === 'number') out[key.slice(0, -5)] = fromCents(v);
      else out[key] = present(v);
    }
    return out;
  }
  return value;
}
