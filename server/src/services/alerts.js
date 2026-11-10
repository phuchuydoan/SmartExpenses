// Budget alerts. An alert fires only on real spending computed from the
// database - never on an AI estimate.
import { prisma } from '../db.js';
import { formatMoney } from '../lib/money.js';
import { budgetStatus } from './finance.js';

const TIPS = [
  [/food|drink|grocer|dining|restaurant|coffee/i, 'Cooking at home for the rest of the month is the fastest way to slow this category down.'],
  [/transport|travel|car|fuel|gas/i, 'Try a transit pass or grouping errands into one trip.'],
  [/entertain|fun|game|subscription/i, 'Look for free events, and pause subscriptions you have not used this month.'],
  [/shop|personal|cloth/i, 'Wait 24 hours before any non-essential purchase.'],
  [/educat|book|tuition/i, 'Check the library or second-hand options before buying new materials.'],
];

export function tipFor(categoryName) {
  const match = TIPS.find(([pattern]) => pattern.test(categoryName));
  return match ? match[1] : 'Review your recent transactions in this category to see what can wait until next month.';
}

/**
 * Decides which alert (if any) applies. Pure and unit tested.
 * Returns { level: 'over' } when spending is strictly above the limit,
 * { level: <threshold> } for the highest user threshold reached, or null.
 */
export function alertLevel(spentCents, limitCents, thresholds) {
  if (limitCents <= 0) return null;
  if (spentCents > limitCents) return { level: 'over' };
  const reached = thresholds
    .filter((t) => Number.isInteger(t) && t > 0 && t <= 100)
    .filter((t) => spentCents * 100 >= limitCents * t);
  if (reached.length === 0) return null;
  return { level: Math.max(...reached) };
}

async function createOnce(userId, notification) {
  try {
    return await prisma.notification.create({ data: { userId, ...notification } });
  } catch (err) {
    if (err.code === 'P2002') return null; // already sent
    throw err;
  }
}

function buildAlert({ month, key, label, spentCents, limitCents, level, currency, tip }) {
  const spent = formatMoney(spentCents, currency);
  const limit = formatMoney(limitCents, currency);
  const data = { month, key, spent: spentCents / 100, limit: limitCents / 100 };
  if (level === 'over') {
    return {
      type: 'budget_exceeded',
      title: `${label} budget exceeded`,
      message: `You've spent ${spent} against a ${limit} limit - ${formatMoney(spentCents - limitCents, currency)} over budget.`,
      tip,
      dedupeKey: `budget:${month}:${key}:over`,
      data: { ...data, percent: Math.floor((spentCents * 100) / limitCents) },
    };
  }
  const percent = Math.floor((spentCents * 100) / limitCents);
  return {
    type: 'budget_threshold',
    title: `You've reached ${percent}% of your ${label} budget`,
    message: `You've spent ${spent} out of your ${limit} monthly limit. ${formatMoney(limitCents - spentCents, currency)} remaining this month.`,
    tip,
    dedupeKey: `budget:${month}:${key}:${level}`,
    data: { ...data, percent, threshold: level },
  };
}

/** Checks the month's budget and stores any newly triggered alerts. Returns the new ones. */
export async function evaluateBudgetAlerts(user, month) {
  const status = await budgetStatus(user.id, month);
  if (!status) return [];
  const thresholds = Array.isArray(user.alertThresholds) ? user.alertThresholds : [50, 80, 100];

  const candidates = [
    { key: 'total', label: 'monthly', spentCents: status.totalSpentCents, limitCents: status.totalLimitCents, tip: null },
    ...status.categories.map((c) => ({
      key: `cat:${c.categoryId}`,
      label: c.name,
      spentCents: c.spentCents,
      limitCents: c.limitCents,
      tip: tipFor(c.name),
      // Rent-like fixed costs are expected to hit 100%: only warn if they go over.
      overOnly: c.isFixed,
    })),
  ];

  const created = [];
  for (const candidate of candidates) {
    const result = alertLevel(candidate.spentCents, candidate.limitCents, candidate.overOnly ? [] : thresholds);
    if (!result) continue;
    const row = await createOnce(
      user.id,
      buildAlert({ month, currency: user.currency, level: result.level, key: candidate.key, label: candidate.label, spentCents: candidate.spentCents, limitCents: candidate.limitCents, tip: candidate.tip }),
    );
    if (row) created.push(row);
  }
  return created;
}

export { createOnce };
