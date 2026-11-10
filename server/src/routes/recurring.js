import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, notFound } from '../lib/http.js';
import { money, isoDate, id } from '../lib/schemas.js';
import { toDate, toIso, todayIn, nextOccurrence, monthOf } from '../lib/dates.js';
import { toCents, fromCents } from '../lib/money.js';
import { assertOwned } from '../lib/ownership.js';
import { validate } from '../middleware/validate.js';
import { evaluateBudgetAlerts } from '../services/alerts.js';
import { runMaintenance } from '../services/maintenance.js';

const router = Router();

const presentRecurring = (r) => ({
  id: r.id,
  type: r.type,
  amount: fromCents(toCents(r.amount)),
  description: r.description,
  frequency: r.frequency,
  nextDueDate: toIso(r.nextDueDate),
  endDate: r.endDate ? toIso(r.endDate) : null,
  autoPost: r.autoPost,
  active: r.active,
  accountId: r.accountId,
  categoryId: r.categoryId,
  category: r.category ? { id: r.category.id, name: r.category.name, color: r.category.color, icon: r.category.icon } : null,
  account: r.account ? { id: r.account.id, name: r.account.name } : undefined,
});

const body = z.object({
  type: z.enum(['income', 'expense']),
  amount: money,
  description: z.string().trim().min(1).max(255),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'yearly']),
  nextDueDate: isoDate,
  endDate: isoDate.nullable().optional(),
  autoPost: z.boolean().default(true),
  active: z.boolean().default(true),
  accountId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
});

const toData = (b) => ({
  ...b,
  categoryId: b.categoryId ?? null,
  nextDueDate: toDate(b.nextDueDate),
  endDate: b.endDate ? toDate(b.endDate) : null,
});

router.get(
  '/',
  handler(async (req, res) => {
    const items = await prisma.recurringTransaction.findMany({
      where: { userId: req.user.id },
      include: { category: true, account: true },
      orderBy: [{ active: 'desc' }, { nextDueDate: 'asc' }],
    });
    res.json({ recurring: items.map(presentRecurring) });
  }),
);

router.post(
  '/',
  validate({ body }),
  handler(async (req, res) => {
    await assertOwned(req.user.id, { accountId: req.body.accountId, categoryId: req.body.categoryId, kind: req.body.type });
    const created = await prisma.recurringTransaction.create({
      data: { ...toData(req.body), userId: req.user.id },
      include: { category: true, account: true },
    });
    await runMaintenance(req.user, { force: true }); // post anything already due
    res.status(201).json({ recurring: presentRecurring(created) });
  }),
);

router.put(
  '/:id',
  validate({ params: z.object({ id }), body }),
  handler(async (req, res) => {
    await assertOwned(req.user.id, { accountId: req.body.accountId, categoryId: req.body.categoryId, kind: req.body.type });
    const result = await prisma.recurringTransaction.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: toData(req.body) });
    if (result.count === 0) throw notFound('Recurring transaction');
    await runMaintenance(req.user, { force: true });
    res.json({ ok: true });
  }),
);

/** Mark a manual bill as paid: records the transaction and moves the due date forward. */
router.post(
  '/:id/pay',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const r = await prisma.recurringTransaction.findFirst({ where: { id: req.params.id, userId: req.user.id, active: true } });
    if (!r) throw notFound('Recurring transaction');
    const today = todayIn(req.user.timezone);
    const next = nextOccurrence(toIso(r.nextDueDate), r.frequency);
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId: req.user.id,
          accountId: r.accountId,
          categoryId: r.categoryId,
          recurringId: r.id,
          type: r.type,
          source: 'recurring',
          amount: r.amount,
          date: toDate(today),
          description: r.description,
        },
      }),
      prisma.recurringTransaction.update({
        where: { id: r.id },
        data: { nextDueDate: toDate(next), active: !(r.endDate && next > toIso(r.endDate)) },
      }),
    ]);
    const alerts = r.type === 'expense' ? await evaluateBudgetAlerts(req.user, monthOf(today)) : [];
    res.status(201).json({ ok: true, nextDueDate: next, alerts });
  }),
);

router.delete(
  '/:id',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const result = await prisma.recurringTransaction.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (result.count === 0) throw notFound('Recurring transaction');
    res.status(204).end();
  }),
);

export default router;
