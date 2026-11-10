import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { handler } from '../lib/http.js';
import { month, moneyOrZero, money } from '../lib/schemas.js';
import { validate } from '../middleware/validate.js';
import { generateInsight, chat, autoBudget } from '../services/ai.js';
import { geminiEnabled } from '../services/gemini.js';

const router = Router();

// AI calls cost money: limit each user to 20 requests per 10 minutes.
router.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => `user:${req.user.id}`,
    skip: (req) => req.method === 'GET',
    message: { error: 'You are asking the AI advisor very quickly. Please wait a few minutes.' },
  }),
);

router.get('/status', (_req, res) => res.json({ enabled: geminiEnabled() }));

router.get(
  '/insights',
  handler(async (req, res) => {
    const rows = await prisma.aiInsight.findMany({
      where: { userId: req.user.id, kind: 'analysis' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json({ insights: rows.map((r) => ({ id: r.id, source: r.source, createdAt: r.createdAt, month: r.month, ...r.content })) });
  }),
);

router.post(
  '/insights',
  validate({ body: z.object({ focus: z.string().trim().max(200).optional() }).default({}) }),
  handler(async (req, res) => res.status(201).json({ insight: await generateInsight(req.user, req.body.focus) })),
);

router.post(
  '/chat',
  validate({
    body: z.object({
      message: z.string().trim().min(1).max(1000),
      history: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) })).max(20).default([]),
    }),
  }),
  handler(async (req, res) => res.json(await chat(req.user, req.body.message, req.body.history))),
);

router.post(
  '/auto-budget',
  validate({
    body: z.object({
      month,
      income: money,
      savingsTarget: moneyOrZero.default(0),
      fixed: z.array(z.object({ categoryId: z.number().int().positive(), amount: money })).max(30).default([]),
    }),
  }),
  handler(async (req, res) => res.json({ proposal: await autoBudget(req.user, req.body) })),
);

export default router;
