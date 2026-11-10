import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, notFound, badRequest } from '../lib/http.js';
import { money, isoDate, id } from '../lib/schemas.js';
import { toDate, toIso, todayIn, daysBetween } from '../lib/dates.js';
import { toCents, fromCents, formatMoney } from '../lib/money.js';
import { assertOwned } from '../lib/ownership.js';
import { validate } from '../middleware/validate.js';
import { goalTotals } from '../services/finance.js';
import { createOnce } from '../services/alerts.js';

const router = Router();

/** Adds progress and the pace needed to hit the target date. */
export function presentGoal(goal, savedCents, today) {
  const targetCents = toCents(goal.targetAmount);
  const remainingCents = Math.max(0, targetCents - savedCents);
  const daysLeft = goal.targetDate ? daysBetween(today, toIso(goal.targetDate)) : null;
  const pace = daysLeft !== null && daysLeft > 0 && remainingCents > 0;
  return {
    id: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    targetAmount: fromCents(targetCents),
    targetDate: goal.targetDate ? toIso(goal.targetDate) : null,
    saved: fromCents(savedCents),
    remaining: fromCents(remainingCents),
    percent: targetCents > 0 ? Math.min(100, Math.floor((savedCents * 100) / targetCents)) : 0,
    completed: savedCents >= targetCents,
    daysLeft,
    overdue: daysLeft !== null && daysLeft <= 0 && remainingCents > 0,
    // Rounded up so following the plan always reaches the target in time.
    perDay: pace ? fromCents(Math.ceil(remainingCents / daysLeft)) : null,
    perWeek: pace ? fromCents(Math.min(remainingCents, Math.ceil((remainingCents * 7) / daysLeft))) : null,
    perMonth: pace ? fromCents(Math.min(remainingCents, Math.ceil((remainingCents * 30) / daysLeft))) : null,
  };
}

export async function listGoals(user) {
  const [goals, totals] = await Promise.all([
    prisma.savingsGoal.findMany({ where: { userId: user.id, archived: false }, orderBy: { id: 'asc' } }),
    goalTotals(user.id),
  ]);
  const today = todayIn(user.timezone);
  return goals.map((g) => presentGoal(g, totals.get(g.id) ?? 0, today));
}

const body = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: money,
  targetDate: isoDate.nullable().optional(),
  icon: z.string().trim().max(30).default('target'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
});

router.get('/', handler(async (req, res) => res.json({ goals: await listGoals(req.user) })));

router.post(
  '/',
  validate({ body }),
  handler(async (req, res) => {
    const { targetDate, ...rest } = req.body;
    const goal = await prisma.savingsGoal.create({
      data: { ...rest, targetDate: targetDate ? toDate(targetDate) : null, userId: req.user.id },
    });
    res.status(201).json({ goal: presentGoal(goal, 0, todayIn(req.user.timezone)) });
  }),
);

router.put(
  '/:id',
  validate({ params: z.object({ id }), body }),
  handler(async (req, res) => {
    const { targetDate, ...rest } = req.body;
    const result = await prisma.savingsGoal.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { ...rest, targetDate: targetDate ? toDate(targetDate) : null },
    });
    if (result.count === 0) throw notFound('Goal');
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    // Contributions stay in the transaction history (goal_id becomes NULL).
    const result = await prisma.savingsGoal.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (result.count === 0) throw notFound('Goal');
    res.status(204).end();
  }),
);

export async function contribute(user, { goalId, accountId, amount, date, source = 'manual' }) {
  await assertOwned(user.id, { goalId, accountId });
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  const before = (await goalTotals(user.id)).get(goalId) ?? 0;
  await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId,
      goalId,
      type: 'savings',
      source,
      amount,
      date: toDate(date),
      description: source === 'sweep' ? `Unspent daily allowance -> ${goal.name}` : `Saved for ${goal.name}`,
    },
  });
  const after = before + toCents(amount);
  const targetCents = toCents(goal.targetAmount);
  if (before < targetCents && after >= targetCents) {
    await createOnce(user.id, {
      type: 'goal_reached',
      title: `Goal reached: ${goal.name}`,
      message: `You saved ${formatMoney(targetCents, user.currency)} for "${goal.name}". Well done!`,
      dedupeKey: `goal:${goal.id}:reached`,
      data: { goalId: goal.id },
    });
  }
  return presentGoal(goal, after, todayIn(user.timezone));
}

router.post(
  '/:id/contribute',
  validate({
    params: z.object({ id }),
    body: z.object({ amount: money, accountId: z.number().int().positive(), date: isoDate.optional() }),
  }),
  handler(async (req, res) => {
    const date = req.body.date ?? todayIn(req.user.timezone);
    if (date > todayIn(req.user.timezone)) throw badRequest('A contribution cannot be dated in the future');
    const goal = await contribute(req.user, { goalId: req.params.id, accountId: req.body.accountId, amount: req.body.amount, date });
    res.status(201).json({ goal });
  }),
);

export default router;
