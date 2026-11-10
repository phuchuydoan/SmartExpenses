// Demo data:  npm run db:seed
// Creates demo@smartspend.app / demo12345 with ~3 months of activity.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '../src/lib/defaults.js';
import { todayIn, toDate, addMonths, monthOf, daysInMonth, addDays } from '../src/lib/dates.js';

const prisma = new PrismaClient();
const EMAIL = 'demo@smartspend.app';

// Small deterministic random generator so the demo looks the same every time.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;

const SPENDING = {
  'Food & Drinks': { perDay: 0.85, items: [['Starbucks coffee', 4, 7], ['Campus cafeteria', 6, 11], ['Groceries', 14, 32], ['Pizza night', 9, 16], ['Bubble tea', 4, 6], ['Lunch with friends', 10, 18]] },
  Transportation: { perDay: 0.3, items: [['Bus fare', 2, 3], ['Metro top-up', 5, 10], ['Ride share', 6, 12]] },
  Education: { perDay: 0.07, items: [['Printing & copies', 3, 8], ['Textbook', 18, 35], ['Online course', 10, 15]] },
  Personal: { perDay: 0.14, items: [['Haircut', 12, 18], ['Toiletries', 5, 14], ['Gym day pass', 5, 8]] },
  Entertainment: { perDay: 0.14, items: [['Movie ticket', 9, 13], ['Game top-up', 5, 10], ['Concert', 15, 25], ['Streaming rental', 3, 5]] },
};
const METHODS = ['Cash', 'Debit Card', 'Credit Card', 'E-wallet'];

async function main() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      name: 'Alex Demo',
      email: EMAIL,
      passwordHash: await bcrypt.hash('demo12345', 12),
      currency: 'USD',
      timezone: 'America/New_York',
      alertThresholds: [50, 80, 100],
      accounts: { create: [{ name: 'Cash', type: 'cash', openingBalance: 450 }, { name: 'Bank account', type: 'bank', openingBalance: 650 }] },
      categories: { create: DEFAULT_CATEGORIES },
    },
    include: { accounts: true, categories: true },
  });
  const cat = Object.fromEntries(user.categories.map((c) => [c.name, c.id]));
  const [cash, bank] = user.accounts;

  const today = todayIn(user.timezone);
  const thisMonth = monthOf(today);
  const months = [addMonths(thisMonth, -2), addMonths(thisMonth, -1), thisMonth];
  const limits = { Housing: 400, 'Food & Drinks': 250, Transportation: 50, Education: 50, Personal: 70, Entertainment: 50, Emergency: 130 };

  const goals = await Promise.all([
    prisma.savingsGoal.create({ data: { userId: user.id, name: 'Emergency fund', targetAmount: 1000, targetDate: toDate(`${addMonths(thisMonth, 8)}-01`), icon: 'shield', color: '#10b981' } }),
    prisma.savingsGoal.create({ data: { userId: user.id, name: 'New laptop', targetAmount: 500, targetDate: toDate(`${addMonths(thisMonth, 4)}-15`), icon: 'laptop', color: '#6366f1' } }),
    prisma.savingsGoal.create({ data: { userId: user.id, name: 'Summer trip', targetAmount: 1500, icon: 'plane', color: '#f59e0b' } }),
  ]);

  const rows = [];
  for (const month of months) {
    await prisma.budget.create({
      data: {
        userId: user.id,
        month,
        income: 1200,
        savingsTarget: 150,
        categories: { create: Object.entries(limits).map(([name, limit]) => ({ categoryId: cat[name], limit })) },
      },
    });
    const lastDay = month === thisMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
    const isCurrent = month === thisMonth;
    rows.push({ accountId: bank.id, categoryId: cat.Allowance, type: 'income', amount: 1000, date: `${month}-01`, description: 'Monthly allowance' });
    if (lastDay >= 15) rows.push({ accountId: bank.id, categoryId: cat.Freelance, type: 'income', amount: 200, date: `${month}-15`, description: 'Tutoring' });
    rows.push({ accountId: bank.id, categoryId: cat.Housing, type: 'expense', amount: 400, date: `${month}-01`, description: 'Rent', paymentMethod: 'Bank transfer' });

    for (let d = 1; d <= lastDay; d += 1) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      for (const [name, config] of Object.entries(SPENDING)) {
        // The current month eats out more, so the alerts and insights have something to say.
        const boost = isCurrent && name === 'Food & Drinks' ? 1.45 : 1;
        if (rand() > config.perDay * boost) continue;
        const [description, min, max] = pick(config.items);
        const paymentMethod = pick(METHODS);
        rows.push({ accountId: paymentMethod === 'Cash' ? cash.id : bank.id, categoryId: cat[name], type: 'expense', amount: between(min, max * boost), date, description, paymentMethod });
      }
    }
    if (lastDay >= 5) {
      rows.push({ accountId: bank.id, goalId: goals[0].id, type: 'savings', amount: 100, date: `${month}-05`, description: 'Saved for Emergency fund' });
      rows.push({ accountId: bank.id, goalId: goals[1].id, type: 'savings', amount: 50, date: `${month}-05`, description: 'Saved for New laptop' });
    }
  }

  await prisma.transaction.createMany({
    data: rows.map((r) => ({ ...r, userId: user.id, date: toDate(r.date), description: r.description ?? '' })),
  });

  await prisma.recurringTransaction.createMany({
    data: [
      { userId: user.id, accountId: bank.id, categoryId: cat.Housing, type: 'expense', amount: 400, description: 'Rent', frequency: 'monthly', nextDueDate: toDate(`${addMonths(thisMonth, 1)}-01`), autoPost: true },
      { userId: user.id, accountId: bank.id, categoryId: cat.Allowance, type: 'income', amount: 1000, description: 'Monthly allowance', frequency: 'monthly', nextDueDate: toDate(`${addMonths(thisMonth, 1)}-01`), autoPost: true },
      { userId: user.id, accountId: bank.id, categoryId: cat.Personal, type: 'expense', amount: 15, description: 'Phone plan', frequency: 'monthly', nextDueDate: toDate(addDays(today, 2)), autoPost: false },
      { userId: user.id, accountId: bank.id, categoryId: cat.Entertainment, type: 'expense', amount: 6.99, description: 'Music subscription', frequency: 'monthly', nextDueDate: toDate(addDays(today, 9)), autoPost: true },
    ],
  });

  console.log(`Seeded ${rows.length} transactions for ${EMAIL} (password: demo12345)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
