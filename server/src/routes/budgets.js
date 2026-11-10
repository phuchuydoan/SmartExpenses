import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, badRequest, notFound } from '../lib/http.js';
import { month, moneyOrZero, money } from '../lib/schemas.js';
import { addMonths } from '../lib/dates.js';
import { validate } from '../middleware/validate.js';
import { budgetStatus, present } from '../services/finance.js';
import { evaluateBudgetAlerts } from '../services/alerts.js';

const router = Router();
const params = z.object({ month });

router.get(
  '/:month',
  validate({ params }),
  handler(async (req, res) => {
    const status = await budgetStatus(req.user.id, req.params.month);
    let previous = null;
    if (!status) {
      const last = await prisma.budget.findFirst({
        where: { userId: req.user.id, month: { lt: req.params.month } },
        orderBy: { month: 'desc' },
        select: { month: true },
      });
      previous = last?.month ?? null;
    }
    res.json({ budget: status ? present(status) : null, previousMonth: previous });
  }),
);

router.put(
  '/:month',
  validate({
    params,
    body: z.object({
      income: moneyOrZero,
      savingsTarget: moneyOrZero.default(0),
      categories: z
        .array(z.object({ categoryId: z.number().int().positive(), limit: money }))
        .min(1, 'Add at least one category')
        .max(50),
    }),
  }),
  handler(async (req, res) => {
    const { income, savingsTarget, categories } = req.body;
    const ids = categories.map((c) => c.categoryId);
    if (new Set(ids).size !== ids.length) throw badRequest('Each category can appear only once in a budget');
    const owned = await prisma.category.count({ where: { id: { in: ids }, userId: req.user.id, kind: 'expense' } });
    if (owned !== ids.length) throw badRequest('Unknown expense category in budget');

    const where = { userId_month: { userId: req.user.id, month: req.params.month } };
    await prisma.$transaction(async (tx) => {
      const budget = await tx.budget.upsert({
        where,
        create: { userId: req.user.id, month: req.params.month, income, savingsTarget },
        update: { income, savingsTarget },
      });
      await tx.budgetCategory.deleteMany({ where: { budgetId: budget.id, categoryId: { notIn: ids } } });
      for (const line of categories) {
        await tx.budgetCategory.upsert({
          where: { budgetId_categoryId: { budgetId: budget.id, categoryId: line.categoryId } },
          create: { budgetId: budget.id, categoryId: line.categoryId, limit: line.limit },
          update: { limit: line.limit },
        });
      }
    });
    const alerts = await evaluateBudgetAlerts(req.user, req.params.month);
    res.json({ budget: present(await budgetStatus(req.user.id, req.params.month)), alerts });
  }),
);

/** Start this month from the most recent earlier budget. */
router.post(
  '/:month/copy-previous',
  validate({ params }),
  handler(async (req, res) => {
    const existing = await prisma.budget.findUnique({ where: { userId_month: { userId: req.user.id, month: req.params.month } } });
    if (existing) throw badRequest('This month already has a budget');
    const source = await prisma.budget.findFirst({
      where: { userId: req.user.id, month: { lt: req.params.month, gte: addMonths(req.params.month, -12) } },
      orderBy: { month: 'desc' },
      include: { categories: { include: { category: true } } },
    });
    if (!source) throw notFound('Previous budget');
    await prisma.budget.create({
      data: {
        userId: req.user.id,
        month: req.params.month,
        income: source.income,
        savingsTarget: source.savingsTarget,
        categories: { create: source.categories.filter((c) => !c.category.archived).map((c) => ({ categoryId: c.categoryId, limit: c.limit })) },
      },
    });
    res.status(201).json({ budget: present(await budgetStatus(req.user.id, req.params.month)) });
  }),
);

router.delete(
  '/:month',
  validate({ params }),
  handler(async (req, res) => {
    await prisma.budget.deleteMany({ where: { userId: req.user.id, month: req.params.month } });
    res.status(204).end();
  }),
);

export default router;
