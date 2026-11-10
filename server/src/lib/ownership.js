import { prisma } from '../db.js';
import { badRequest } from './http.js';

// Users can only reference their own accounts, categories and goals.
export async function assertOwned(userId, { accountId, categoryId, goalId, kind }) {
  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw badRequest('Unknown account');
  }
  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!category) throw badRequest('Unknown category');
    if (kind && category.kind !== kind) throw badRequest(`Category "${category.name}" is not an ${kind} category`);
  }
  if (goalId) {
    const goal = await prisma.savingsGoal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw badRequest('Unknown savings goal');
  }
}
