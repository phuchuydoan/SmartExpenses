// Accounts and categories.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, notFound, HttpError } from '../lib/http.js';
import { id } from '../lib/schemas.js';
import { fromCents, toCents } from '../lib/money.js';
import { validate } from '../middleware/validate.js';
import { accountBalances } from '../services/finance.js';

const router = Router();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #10b981');

// ----- accounts
router.get(
  '/accounts',
  handler(async (req, res) => {
    const balances = await accountBalances(req.user.id);
    res.json({ accounts: balances.map(({ balanceCents, ...a }) => ({ ...a, balance: fromCents(balanceCents) })) });
  }),
);

const accountBody = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(['cash', 'bank', 'credit_card', 'ewallet']).default('cash'),
  openingBalance: z.number().min(-9_999_999_999.99).max(9_999_999_999.99).default(0),
});

router.post(
  '/accounts',
  validate({ body: accountBody }),
  handler(async (req, res) => {
    const account = await prisma.account.create({ data: { ...req.body, userId: req.user.id } });
    res.status(201).json({ account: { id: account.id, name: account.name, type: account.type, balance: fromCents(toCents(account.openingBalance)) } });
  }),
);

router.put(
  '/accounts/:id',
  validate({ params: z.object({ id }), body: accountBody.pick({ name: true, type: true }) }),
  handler(async (req, res) => {
    const result = await prisma.account.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: req.body });
    if (result.count === 0) throw notFound('Account');
    res.json({ ok: true });
  }),
);

router.delete(
  '/accounts/:id',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const account = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!account) throw notFound('Account');
    const remaining = await prisma.account.count({ where: { userId: req.user.id, archived: false } });
    if (remaining <= 1) throw new HttpError(400, 'You need at least one account');
    const used = await prisma.transaction.count({ where: { accountId: account.id } });
    // Accounts with history are archived so past transactions stay intact.
    if (used > 0) await prisma.account.update({ where: { id: account.id }, data: { archived: true } });
    else await prisma.account.delete({ where: { id: account.id } });
    res.status(204).end();
  }),
);

// ----- categories
router.get(
  '/categories',
  handler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: req.user.id, archived: false },
      orderBy: [{ kind: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, kind: true, icon: true, color: true, isFixed: true },
    });
    res.json({ categories });
  }),
);

const categoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['income', 'expense']).default('expense'),
  icon: z.string().trim().max(30).default('tag'),
  color: color.default('#64748b'),
  isFixed: z.boolean().default(false),
});

const duplicate = (err) => {
  if (err.code === 'P2002') throw new HttpError(409, 'You already have a category with this name');
  throw err;
};

router.post(
  '/categories',
  validate({ body: categoryBody }),
  handler(async (req, res) => {
    const category = await prisma.category.create({ data: { ...req.body, userId: req.user.id } }).catch(duplicate);
    res.status(201).json({ category });
  }),
);

router.put(
  '/categories/:id',
  validate({ params: z.object({ id }), body: categoryBody.omit({ kind: true }) }),
  handler(async (req, res) => {
    const result = await prisma.category
      .updateMany({ where: { id: req.params.id, userId: req.user.id }, data: req.body })
      .catch(duplicate);
    if (result.count === 0) throw notFound('Category');
    res.json({ ok: true });
  }),
);

router.delete(
  '/categories/:id',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const category = await prisma.category.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!category) throw notFound('Category');
    const used = await prisma.transaction.count({ where: { categoryId: category.id } });
    if (used > 0) {
      // Keep history readable; free the name for reuse.
      await prisma.category.update({ where: { id: category.id }, data: { archived: true, name: `${category.name} (archived ${category.id})`.slice(0, 60) } });
      await prisma.budgetCategory.deleteMany({ where: { categoryId: category.id } });
    } else {
      await prisma.category.delete({ where: { id: category.id } });
    }
    res.status(204).end();
  }),
);

export default router;
