import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import transactionRoutes from './routes/transactions.js';
import catalogRoutes from './routes/catalog.js';
import budgetRoutes from './routes/budgets.js';
import goalRoutes from './routes/goals.js';
import plannerRoutes from './routes/planner.js';
import recurringRoutes from './routes/recurring.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import aiRoutes from './routes/ai.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Slow down password guessing.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many attempts. Please try again later.' } });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth', authRoutes);

  // Everything below needs a signed-in user; every query is scoped to req.user.id.
  app.use('/api', requireAuth);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/goals', goalRoutes);
  app.use('/api/planner', plannerRoutes);
  app.use('/api/recurring', recurringRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
