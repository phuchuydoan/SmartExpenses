import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, notFound } from '../lib/http.js';
import { id } from '../lib/schemas.js';
import { validate } from '../middleware/validate.js';
import { runMaintenance } from '../services/maintenance.js';

const router = Router();

router.get(
  '/',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), unread: z.enum(['true', 'false']).optional() }) }),
  handler(async (req, res) => {
    await runMaintenance(req.user);
    const where = { userId: req.user.id, ...(req.validQuery.unread === 'true' ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: req.validQuery.limit }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({
      unread,
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        tip: n.tip,
        data: n.data,
        read: Boolean(n.readAt),
        createdAt: n.createdAt,
      })),
    });
  }),
);

router.post(
  '/read-all',
  handler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/read',
  validate({ params: z.object({ id }) }),
  handler(async (req, res) => {
    const result = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { readAt: new Date() } });
    if (result.count === 0) throw notFound('Notification');
    res.json({ ok: true });
  }),
);


export default router;
