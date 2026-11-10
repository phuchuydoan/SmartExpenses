// Background housekeeping per user: post recurring transactions, remind about
// bills, detect unusual spending and build the weekly report.
import { prisma } from '../db.js';
import { toCents, formatMoney } from '../lib/money.js';
import { todayIn, toDate, toIso, addDays, monthOf, weekStart, nextOccurrence, daysBetween } from '../lib/dates.js';
import { createOnce, evaluateBudgetAlerts } from './alerts.js';
import { expensesByCategory, totalsBetween } from './finance.js';

/** Posts due auto-post recurring transactions. Returns affected months. */
export async function processRecurring(userId, today) {
  const due = await prisma.recurringTransaction.findMany({
    where: { userId, active: true, autoPost: true, nextDueDate: { lte: toDate(today) } },
  });
  const months = new Set();
  for (const r of due) {
    let date = toIso(r.nextDueDate);
    const stop = r.endDate ? toIso(r.endDate) : null;
    const rows = [];
    for (let i = 0; i < 60 && date <= today && (!stop || date <= stop); i += 1) {
      rows.push({
        userId,
        accountId: r.accountId,
        categoryId: r.categoryId,
        recurringId: r.id,
        type: r.type,
        source: 'recurring',
        amount: r.amount,
        date: toDate(date),
        description: r.description,
      });
      months.add(monthOf(date));
      date = nextOccurrence(date, r.frequency);
    }
    // The guard on nextDueDate makes this safe if two requests race.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.recurringTransaction.updateMany({
        where: { id: r.id, nextDueDate: r.nextDueDate },
        data: { nextDueDate: toDate(date), active: !(stop && date > stop) },
      });
      if (claimed.count === 1 && rows.length) await tx.transaction.createMany({ data: rows });
    });
  }
  return [...months];
}

async function billReminders(user, today) {
  const until = addDays(today, user.billReminderDays);
  const bills = await prisma.recurringTransaction.findMany({
    where: { userId: user.id, active: true, type: 'expense', nextDueDate: { lte: toDate(until) } },
  });
  for (const bill of bills) {
    const due = toIso(bill.nextDueDate);
    const days = daysBetween(today, due);
    const amount = formatMoney(toCents(bill.amount), user.currency);
    const when = days < 0 ? `was due ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'is due today' : `is due in ${days} day${days === 1 ? '' : 's'}`;
    await createOnce(user.id, {
      type: 'bill_reminder',
      title: `Upcoming bill: ${bill.description}`,
      message: `${bill.description} (${amount}) ${when}.${bill.autoPost ? ' It will be recorded automatically.' : ' Mark it as paid once you have paid it.'}`,
      dedupeKey: `bill:${bill.id}:${due}`,
      data: { recurringId: bill.id, dueDate: due, amount: toCents(bill.amount) / 100 },
    });
  }
}

/** Pure check used by unusualSpending (unit tested). */
export function isUnusual(last7Cents, prior28Cents) {
  const weeklyAverage = prior28Cents / 4;
  if (weeklyAverage <= 0) return null;
  const increase = last7Cents - weeklyAverage;
  if (increase < 1000 || last7Cents < weeklyAverage * 1.35) return null; // at least +$10 and +35%
  return { percent: Math.round((increase / weeklyAverage) * 100), weeklyAverageCents: Math.round(weeklyAverage) };
}

async function unusualSpending(user, today) {
  const end = addDays(today, 1);
  const weekAgo = addDays(today, -6);
  const [recent, prior, categories] = await Promise.all([
    expensesByCategory(user.id, weekAgo, end),
    expensesByCategory(user.id, addDays(weekAgo, -28), weekAgo),
    prisma.category.findMany({ where: { userId: user.id, isFixed: false } }),
  ]);
  for (const category of categories) {
    const result = isUnusual(recent.get(category.id) ?? 0, prior.get(category.id) ?? 0);
    if (!result) continue;
    await createOnce(user.id, {
      type: 'unusual_spending',
      title: `Unusual spending on ${category.name}`,
      message: `You spent ${formatMoney(recent.get(category.id), user.currency)} on ${category.name} in the last 7 days - ${result.percent}% more than your weekly average of ${formatMoney(result.weeklyAverageCents, user.currency)}.`,
      dedupeKey: `unusual:${category.id}:${weekStart(today)}`,
      data: { categoryId: category.id, percent: result.percent },
    });
  }
}

async function weeklyReport(user, today) {
  const thisMonday = weekStart(today);
  const lastMonday = addDays(thisMonday, -7);
  const [totals, byCategory, previous] = await Promise.all([
    totalsBetween(user.id, lastMonday, thisMonday),
    expensesByCategory(user.id, lastMonday, thisMonday),
    totalsBetween(user.id, addDays(lastMonday, -7), lastMonday),
  ]);
  if (totals.count === 0) return;
  let top = null;
  for (const [categoryId, cents] of byCategory) if (!top || cents > top.cents) top = { categoryId, cents };
  const topCategory = top?.categoryId ? await prisma.category.findUnique({ where: { id: top.categoryId } }) : null;
  const change = previous.expense > 0 ? Math.round(((totals.expense - previous.expense) / previous.expense) * 100) : null;
  const parts = [`Last week you spent ${formatMoney(totals.expense, user.currency)}`];
  if (change !== null) parts.push(`(${change >= 0 ? '+' : ''}${change}% vs the week before)`);
  let message = `${parts.join(' ')}.`;
  if (topCategory) message += ` Top category: ${topCategory.name} (${formatMoney(top.cents, user.currency)}).`;
  if (totals.savings > 0) message += ` You saved ${formatMoney(totals.savings, user.currency)}.`;
  await createOnce(user.id, {
    type: 'weekly_report',
    title: 'Your weekly spending report',
    message,
    dedupeKey: `weekly:${lastMonday}`,
    data: { weekStart: lastMonday, expense: totals.expense / 100, income: totals.income / 100, savings: totals.savings / 100 },
  });
}

// Avoid redoing the work on every request: at most once per user every 10 minutes.
const lastRun = new Map();

export async function runMaintenance(user, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastRun.get(user.id) ?? 0) < 10 * 60 * 1000) return;
  lastRun.set(user.id, now);
  const today = todayIn(user.timezone);
  const months = await processRecurring(user.id, today);
  for (const month of new Set([...months, monthOf(today)])) await evaluateBudgetAlerts(user, month);
  await billReminders(user, today);
  if (user.notifyUnusual) await unusualSpending(user, today);
  if (user.notifyWeekly) await weeklyReport(user, today);
}

export async function runMaintenanceForAll() {
  const users = await prisma.user.findMany();
  for (const user of users) {
    try {
      await runMaintenance(user, { force: true });
    } catch (err) {
      console.error(`Maintenance failed for user ${user.id}`, err);
    }
  }
}

