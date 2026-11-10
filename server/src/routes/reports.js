// Dashboard and analytics.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler } from '../lib/http.js';
import { month } from '../lib/schemas.js';
import { todayIn, monthOf, monthRange } from '../lib/dates.js';
import { fromCents } from '../lib/money.js';
import { validate } from '../middleware/validate.js';
import { accountBalances, budgetStatus, totalsBetween, present } from '../services/finance.js';
import { dailyPlan } from '../services/planner.js';
import { analytics } from '../services/analytics.js';
import { runMaintenance } from '../services/maintenance.js';
import { presentTransaction } from './transactions.js';
import { listGoals } from './goals.js';

const router = Router();

router.get(
  '/dashboard',
  handler(async (req, res) => {
    const user = req.user;
    await runMaintenance(user);
    const today = todayIn(user.timezone);
    const month_ = monthOf(today);
    const { start, end } = monthRange(month_);
    const [balances, totals, status, plan, recent, insight, unread, goals] = await Promise.all([
      accountBalances(user.id),
      totalsBetween(user.id, start, end),
      budgetStatus(user.id, month_),
      dailyPlan(user.id, today),
      prisma.transaction.findMany({
        where: { userId: user.id },
        include: { account: true, category: true, goal: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 6,
      }),
      prisma.aiInsight.findFirst({ where: { userId: user.id, kind: 'analysis' }, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      listGoals(user),
    ]);
    res.json({
      today,
      month: month_,
      balance: fromCents(balances.reduce((sum, a) => sum + a.balanceCents, 0)),
      accounts: balances.map(({ balanceCents, ...a }) => ({ ...a, balance: fromCents(balanceCents) })),
      income: fromCents(totals.income),
      expenses: fromCents(totals.expense),
      saved: fromCents(totals.savings),
      budget: status ? present(status) : null,
      plan: plan ? present(plan) : null,
      recent: recent.map(presentTransaction),
      insight: insight ? { id: insight.id, source: insight.source, createdAt: insight.createdAt, ...insight.content } : null,
      unreadNotifications: unread,
      goals,
    });
  }),
);

router.get(
  '/analytics',
  validate({ query: z.object({ month: month.optional() }) }),
  handler(async (req, res) => {
    const today = todayIn(req.user.timezone);
    const data = await analytics(req.user.id, req.validQuery.month ?? monthOf(today), today);
    res.json(present(data));
  }),
);

export default router;
