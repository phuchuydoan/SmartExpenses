import { Router } from 'express';
import { z } from 'zod';
import { handler, badRequest } from '../lib/http.js';
import { money } from '../lib/schemas.js';
import { todayIn } from '../lib/dates.js';
import { toCents } from '../lib/money.js';
import { validate } from '../middleware/validate.js';
import { dailyPlan } from '../services/planner.js';
import { present } from '../services/finance.js';
import { contribute } from './goals.js';

const router = Router();

router.get(
  '/today',
  handler(async (req, res) => {
    const plan = await dailyPlan(req.user.id, todayIn(req.user.timezone));
    res.json({ plan: plan ? present(plan) : null });
  }),
);

/** Move (part of) today's unspent allowance into a savings goal. */
router.post(
  '/sweep',
  validate({ body: z.object({ goalId: z.number().int().positive(), accountId: z.number().int().positive(), amount: money }) }),
  handler(async (req, res) => {
    const today = todayIn(req.user.timezone);
    const plan = await dailyPlan(req.user.id, today);
    if (!plan) throw badRequest('Create a budget for this month first');
    if (toCents(req.body.amount) > plan.leftoverCents) {
      throw badRequest(`You only have ${(plan.leftoverCents / 100).toFixed(2)} left from today's allowance`);
    }
    const goal = await contribute(req.user, { ...req.body, date: today, source: 'sweep' });
    res.status(201).json({ goal, plan: present(await dailyPlan(req.user.id, today)) });
  }),
);

export default router;
