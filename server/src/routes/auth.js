import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, HttpError } from '../lib/http.js';
import { isValidTimezone } from '../lib/dates.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { DEFAULT_CATEGORIES } from '../lib/defaults.js';

const router = Router();

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  currency: u.currency,
  timezone: u.timezone,
  alertThresholds: u.alertThresholds,
  billReminderDays: u.billReminderDays,
  notifyUnusual: u.notifyUnusual,
  notifyWeekly: u.notifyWeekly,
});

const timezone = z.string().max(64).refine(isValidTimezone, 'Unknown timezone');
const currency = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code');

router.post(
  '/register',
  validate({
    body: z.object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email().max(191),
      password: z.string().min(8, 'Password must be at least 8 characters').max(72),
      currency: currency.default('USD'),
      timezone: timezone.default('UTC'),
    }),
  }),
  handler(async (req, res) => {
    const { name, email, password, currency: cur, timezone: tz } = req.body;
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, 'An account with this email already exists');
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        currency: cur,
        timezone: tz,
        alertThresholds: [50, 80, 100],
        accounts: { create: [{ name: 'Cash', type: 'cash' }, { name: 'Bank account', type: 'bank' }] },
        categories: { create: DEFAULT_CATEGORIES },
      },
    });
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

router.post(
  '/login',
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) }) }),
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    // Same error for unknown email and wrong password.
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch(
  '/me',
  requireAuth,
  validate({
    body: z
      .object({
        name: z.string().trim().min(1).max(100),
        currency,
        timezone,
        alertThresholds: z.array(z.number().int().min(1).max(100)).max(8).transform((a) => [...new Set(a)].sort((x, y) => x - y)),
        billReminderDays: z.number().int().min(0).max(14),
        notifyUnusual: z.boolean(),
        notifyWeekly: z.boolean(),
      })
      .partial(),
  }),
  handler(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.user.id }, data: req.body });
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/me/password',
  requireAuth,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(8).max(72) }) }),
  handler(async (req, res) => {
    if (!(await bcrypt.compare(req.body.currentPassword, req.user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12) } });
    res.json({ ok: true });
  }),
);

export default router;
