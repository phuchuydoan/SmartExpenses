import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, notFound, badRequest } from '../lib/http.js';
import { money, isoDate, month, id } from '../lib/schemas.js';
import { toDate, toIso, monthOf, monthRange } from '../lib/dates.js';
import { toCents, fromCents } from '../lib/money.js';
import { assertOwned } from '../lib/ownership.js';
import { validate } from '../middleware/validate.js';
import { evaluateBudgetAlerts } from '../services/alerts.js';

const router = Router();

export const presentTransaction = (t) => ({
  id: t.id,
  type: t.type,
  source: t.source,
  amount: fromCents(toCents(t.amount)),
  date: toIso(t.date),
  description: t.description,
  paymentMethod: t.paymentMethod,
  accountId: t.accountId,
  categoryId: t.categoryId,
  goalId: t.goalId,
  account: t.account ? { id: t.account.id, name: t.account.name } : undefined,
  category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color, icon: t.category.icon } : null,
  goal: t.goal ? { id: t.goal.id, name: t.goal.name } : null,
});

const include = { account: true, category: true, goal: true };

const body = z.object({
  type: z.enum(['income', 'expense']),
  amount: money,
  date: isoDate,
  accountId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(255).default(''),
  paymentMethod: z.string().trim().max(40).nullable().optional(),
});

router.get(
  '/',
  validate({
    query: z.object({
      month: month.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      type: z.enum(['income', 'expense', 'savings']).optional(),
      categoryId: id.optional(),
      accountId: id.optional(),
      q: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
  }),
  handler(async (req, res) => {
    const { month: m, from, to, type, categoryId, accountId, q, page, pageSize } = req.validQuery;
    const where = { userId: req.user.id };
    if (m) {
      const range = monthRange(m);
      where.date = { gte: toDate(range.start), lt: toDate(range.end) };
    }
    if (from || to) where.date = { ...(where.date ?? {}), ...(from ? { gte: toDate(from) } : {}), ...(to ? { lte: toDate(to) } : {}) };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (accountId) where.accountId = accountId;
    if (q) where.description = { contains: q };

    const [items, total, sums] = await Promise.all([
      prisma.transaction.findMany({ where, include, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true } }),
    ]);
    const totals = { income: 0, expense: 0, savings: 0 };
    for (const row of sums) totals[row.type] = fromCents(toCents(row._sum.amount));
    res.json({ items: items.map(presentTransaction), total, page, pageSize, totals });
  }),
);

router.post(
  '/',
  validate({ body }),
  handler(async (req, res) => {
    const data = req.body;
    await assertOwned(req.user.id, { accountId: data.accountId, categoryId: data.categoryId, kind: data.type });
    const created = await prisma.transaction.create({
      data: { ...data, categoryId: data.categoryId ?? null, date: toDate(data.date), userId: req.user.id },
      include,
    });
    const alerts = data.type === 'expense' ? await evaluateBudgetAlerts(req.user, monthOf(data.date)) : [];
    res.status(201).json({ transaction: presentTransaction(created), alerts });
  }),
);

router.put(
  '/:id',
  validate({ params: z.object({ id }), body }),
  handler(async (req, res) => {
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) throw notFound('Transaction');
    if (existing.type === 'savings') throw badRequest('Goal contributions cannot be edited. Delete it and add a new one instead.');
    const data = req.body;
    await assertOwned(req.user.id, { accountId: data.accountId, categoryId: data.categoryId, kind: data.type });
    const updated = await prisma.transaction.update({
      where: { id: existing.id },
      data: { ...data, categoryId: data.categoryId ?? null, date: toDate(data.date) },
      include,
    });
    const alerts = data.type === 'expense' ? await evaluateBudgetAlerts(req.user, monthOf(data.date)) : [];
    res.json({ transaction: presentTransaction(updated), alerts });
  }),
);

router.delete(
  '/:id',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const result = await prisma.transaction.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (result.count === 0) throw notFound('Transaction');
    res.status(204).end();
  }),
);

export default router;
