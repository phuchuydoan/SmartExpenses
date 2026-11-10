import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, handler } from '../lib/http.js';

export const signToken = (userId) =>
  jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/** Requires a valid Bearer token and loads the user onto req.user. */
export const requireAuth = handler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) throw new HttpError(401, 'Invalid or expired session');
  req.user = user;
  next();
});
