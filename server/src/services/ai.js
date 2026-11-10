// AI Financial Advisor.
//
// Rule #1: Gemini never does the accounting. Node.js computes every figure
// from MySQL (the "snapshot" below); Gemini only reads those figures and
// explains / advises. Everything it returns is validated before it is used.
import { z } from 'zod';
import { prisma } from '../db.js';
import { fromCents, toCents, allocate } from '../lib/money.js';
import { todayIn, monthOf, monthRange, addMonths, addDays, toDate, toIso, daysBetween } from '../lib/dates.js';
import { budgetStatus, totalsBetween, expensesByCategory, accountBalances, goalTotals } from './finance.js';
import { dailyPlan } from './planner.js';
import { categoryBreakdown } from './analytics.js';
import { generateJson, geminiEnabled, GeminiError } from './gemini.js';
import { HttpError } from '../lib/http.js';

const m = fromCents;

/** Aggregated, de-identified view of the user's finances for the AI. */
export async function buildSnapshot(user) {
  const today = todayIn(user.timezone);
  const month = monthOf(today);
  const { start, end } = monthRange(month);
  const previous = monthRange(addMonths(month, -1));
  const weekAgo = addDays(today, -6);

  const [status, totals, lastTotals, plan, breakdown, lastBreakdown, recent, prior, balances, goals, saved, topRows] =
    await Promise.all([
      budgetStatus(user.id, month),
      totalsBetween(user.id, start, end),
      totalsBetween(user.id, previous.start, previous.end),
      dailyPlan(user.id, today),
      categoryBreakdown(user.id, start, end),
      categoryBreakdown(user.id, previous.start, previous.end),
      expensesByCategory(user.id, weekAgo, addDays(today, 1)),
      expensesByCategory(user.id, addDays(weekAgo, -28), weekAgo),
      accountBalances(user.id),
      prisma.savingsGoal.findMany({ where: { userId: user.id, archived: false } }),
      goalTotals(user.id),
      prisma.transaction.groupBy({
        by: ['description'],
        where: { userId: user.id, type: 'expense', date: { gte: toDate(start), lt: toDate(end) }, description: { not: '' } },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
        take: 8,
      }),
    ]);

  const lastById = new Map(lastBreakdown.map((c) => [c.categoryId, c.amountCents]));
  const budgetById = new Map((status?.categories ?? []).map((c) => [c.categoryId, c]));

  return {
    currency: user.currency,
    today,
    month,
    days_left_in_month: plan?.daysLeft ?? daysBetween(today, end),
    account_balance_total: m(balances.reduce((sum, a) => sum + a.balanceCents, 0)),
    this_month: { income: m(totals.income), expenses: m(totals.expense), moved_to_savings: m(totals.savings) },
    last_month: { income: m(lastTotals.income), expenses: m(lastTotals.expense), moved_to_savings: m(lastTotals.savings) },
    budget: status
      ? {
          planned_income: m(status.incomeCents),
          savings_target: m(status.savingsTargetCents),
          total_limit: m(status.totalLimitCents),
          total_spent: m(status.totalSpentCents),
          total_remaining: m(status.remainingCents),
          percent_used: status.percentUsed,
        }
      : null,
    categories: breakdown.map((c) => {
      const b = budgetById.get(c.categoryId);
      const weeklyAverage = (prior.get(c.categoryId ?? 0) ?? 0) / 4;
      return {
        name: c.name,
        spent_this_month: m(c.amountCents),
        spent_last_month: m(lastById.get(c.categoryId) ?? 0),
        budget_limit: b ? m(b.limitCents) : null,
        budget_remaining: b ? m(b.remainingCents) : null,
        percent_of_budget_used: b ? b.percentUsed : null,
        fixed_cost: b?.isFixed ?? false,
        spent_last_7_days: m(recent.get(c.categoryId ?? 0) ?? 0),
        average_weekly_spend_prior_4_weeks: m(Math.round(weeklyAverage)),
      };
    }),
    // Budget lines with no spending yet are still useful context.
    untouched_budget_lines: (status?.categories ?? [])
      .filter((c) => c.spentCents === 0)
      .map((c) => ({ name: c.name, budget_limit: m(c.limitCents) })),
    daily_plan: plan
      ? {
          suggested_daily_limit: m(plan.dailyLimitCents),
          spent_today: m(plan.spentTodayCents),
          flexible_money_left_this_month: m(Math.max(0, plan.poolCents - plan.spentTodayCents - plan.sweptTodayCents)),
          set_aside_for_upcoming_bills: m(plan.reservedCents),
        }
      : null,
    upcoming_bills: (plan?.upcomingBills ?? []).map((b) => ({ name: b.description.slice(0, 40), date: b.date, amount: m(b.amountCents) })),
    top_expenses_this_month: topRows.map((r) => ({
      label: r.description.slice(0, 40),
      total: m(toCents(r._sum.amount)),
      times: r._count,
    })),
    savings_goals: goals.map((g) => {
      const savedCents = saved.get(g.id) ?? 0;
      const targetCents = toCents(g.targetAmount);
      const daysLeft = g.targetDate ? daysBetween(today, toIso(g.targetDate)) : null;
      return {
        name: g.name,
        target: m(targetCents),
        saved: m(savedCents),
        target_date: g.targetDate ? toIso(g.targetDate) : null,
        needed_per_week: daysLeft && daysLeft > 0 ? m(Math.ceil(((targetCents - savedCents) * 7) / daysLeft)) : null,
      };
    }),
  };
}

const BASE_RULES = `You are SmartSpend AI, a friendly personal-finance coach for students and young adults.
You are given a JSON snapshot of the user's finances. Every number in it was calculated by the app's backend and is exact.
Rules:
- Use ONLY numbers that appear in the snapshot, or simple arithmetic on them. Never invent balances, transactions or percentages.
- If the snapshot does not contain what is needed to answer, say so plainly.
- Be specific and practical: name categories and amounts. Keep a warm, encouraging tone; never shame the user.
- Do not recommend specific investments, loans or financial products. You give budgeting guidance, not professional financial advice.
- Write in English. Amounts are in the snapshot's currency.`;

// ---------- 1. Insights (analysis + recommendations) ----------

const insightSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    observations: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          action: { type: 'STRING' },
          potential_savings: { type: 'NUMBER' },
        },
        required: ['category', 'action', 'potential_savings'],
      },
    },
    priority: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: ['summary', 'observations', 'recommendations', 'priority'],
};

const insightShape = z.object({
  summary: z.string().min(1).max(400),
  observations: z.array(z.string().min(1).max(300)).max(6),
  recommendations: z
    .array(z.object({ category: z.string().min(1).max(60), action: z.string().min(1).max(300), potential_savings: z.number().finite() }))
    .max(6),
  priority: z.enum(['low', 'medium', 'high']),
});

/** Keeps the AI honest: a suggested saving can never exceed what was actually spent. */
function sanitizeInsight(raw, snapshot) {
  const parsed = insightShape.parse(raw);
  const spentByName = new Map(snapshot.categories.map((c) => [c.name.toLowerCase(), c.spent_this_month]));
  const totalSpent = snapshot.this_month.expenses;
  return {
    ...parsed,
    recommendations: parsed.recommendations.map((r) => {
      const cap = spentByName.get(r.category.toLowerCase()) ?? totalSpent;
      return { ...r, potential_savings: Math.round(Math.min(Math.max(0, r.potential_savings), cap) * 100) / 100 };
    }),
  };
}

/** Deterministic insights used when Gemini is unavailable. */
export function ruleBasedInsight(snapshot) {
  const observations = [];
  const recommendations = [];
  let priority = 'low';
  const cats = snapshot.categories.filter((c) => !c.fixed_cost);

  for (const c of cats) {
    if (c.budget_limit !== null && c.budget_remaining < 0) {
      priority = 'high';
      observations.push(`${c.name} is ${Math.abs(c.budget_remaining).toFixed(2)} ${snapshot.currency} over its ${c.budget_limit.toFixed(2)} budget.`);
    } else if (c.percent_of_budget_used !== null && c.percent_of_budget_used >= 80) {
      if (priority === 'low') priority = 'medium';
      observations.push(`${c.name} has used ${c.percent_of_budget_used}% of its budget with ${snapshot.days_left_in_month} days left.`);
    }
    const avg = c.average_weekly_spend_prior_4_weeks;
    if (avg > 0 && c.spent_last_7_days >= avg * 1.25 && c.spent_last_7_days - avg >= 5) {
      const pct = Math.round(((c.spent_last_7_days - avg) / avg) * 100);
      observations.push(`You spent ${pct}% more on ${c.name} in the last 7 days than your weekly average.`);
      recommendations.push({
        category: c.name,
        action: `Bring ${c.name} back to your usual ${avg.toFixed(2)} per week.`,
        potential_savings: Math.round((c.spent_last_7_days - avg) * 100) / 100,
      });
    }
  }
  const top = [...cats].sort((a, b) => b.spent_this_month - a.spent_this_month)[0];
  if (top && recommendations.length === 0 && top.spent_this_month > 0) {
    recommendations.push({
      category: top.name,
      action: `${top.name} is your largest flexible category. Trimming it by 10% is the easiest win.`,
      potential_savings: Math.round(top.spent_this_month * 10) / 100,
    });
  }
  if (snapshot.daily_plan) {
    observations.push(
      `You have ${snapshot.daily_plan.flexible_money_left_this_month.toFixed(2)} ${snapshot.currency} of flexible budget for the next ${snapshot.days_left_in_month} days - about ${snapshot.daily_plan.suggested_daily_limit.toFixed(2)} per day.`,
    );
  }
  if (observations.length === 0) observations.push('Not enough activity yet this month to spot a trend. Keep logging your expenses.');

  const summary =
    priority === 'high'
      ? 'One or more categories are over budget this month.'
      : priority === 'medium'
        ? 'You are close to the limit in some categories.'
        : 'Your spending is on track this month.';
  return { summary, observations: observations.slice(0, 5), recommendations: recommendations.slice(0, 4), priority };
}

export async function generateInsight(user, focus) {
  const snapshot = await buildSnapshot(user);
  let content;
  let source = 'rules';
  if (geminiEnabled() && snapshot.this_month.expenses > 0) {
    try {
      const raw = await generateJson({
        system: `${BASE_RULES}
Task: analyse the snapshot and return JSON with:
- summary: one sentence with the single most important takeaway.
- observations: 2-4 concrete facts about spending behaviour (trends, comparisons with last month or with the weekly average, budget status).
- recommendations: 2-4 actions. "category" must be one of the category names in the snapshot. "potential_savings" is a realistic amount for the rest of this month and must not exceed what was spent in that category.
- priority: "high" if a budget is exceeded or about to be, "medium" if there is a clear risk, otherwise "low".`,
        contents: `${focus ? `The user asks you to focus on: ${focus}\n\n` : ''}Snapshot:\n${JSON.stringify(snapshot)}`,
        schema: insightSchema,
      });
      content = sanitizeInsight(raw, snapshot);
      source = 'gemini';
    } catch (err) {
      if (!(err instanceof GeminiError) && !(err instanceof z.ZodError)) throw err;
      console.warn('Gemini insight failed, using rule-based fallback:', err.message);
    }
  }
  if (!content) content = ruleBasedInsight(snapshot);

  const saved = await prisma.aiInsight.create({
    data: { userId: user.id, kind: 'analysis', month: snapshot.month, source, prompt: focus || null, content },
  });
  return { id: saved.id, source, createdAt: saved.createdAt, month: snapshot.month, ...content };
}

// ---------- 2. Chat with your money ----------

const chatSchema = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    follow_ups: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['reply'],
};

export async function chat(user, message, history = []) {
  if (!geminiEnabled()) {
    return {
      source: 'rules',
      reply: 'The AI advisor is not configured on this server yet (missing GEMINI_API_KEY). Your dashboard, daily plan and reports still work as usual.',
      followUps: [],
    };
  }
  const snapshot = await buildSnapshot(user);
  try {
    const raw = await generateJson({
      system: `${BASE_RULES}
Task: answer the user's question in a short chat message (2-6 sentences, plain text, no markdown tables).
For "can I afford X" questions, compare X with daily_plan.flexible_money_left_this_month and the relevant category's budget_remaining, and state the trade-off.
Also return up to 3 short follow_ups the user might ask next.

Snapshot:
${JSON.stringify(snapshot)}`,
      contents: [...history.slice(-10), { role: 'user', text: message }],
      schema: chatSchema,
      temperature: 0.6,
    });
    const reply = z.string().min(1).max(4000).parse(raw.reply);
    const followUps = z.array(z.string().max(120)).max(3).catch([]).parse(raw.follow_ups ?? []);
    await prisma.aiInsight.create({
      data: { userId: user.id, kind: 'chat', month: snapshot.month, source: 'gemini', prompt: message, content: { reply } },
    });
    return { source: 'gemini', reply, followUps };
  } catch (err) {
    if (!(err instanceof GeminiError) && !(err instanceof z.ZodError)) throw err;
    console.warn('Gemini chat failed:', err.message);
    return {
      source: 'error',
      reply: 'Sorry, I could not reach the AI service just now. Please try again in a moment.',
      followUps: [],
    };
  }
}

// ---------- 3. AI Auto Budget ----------

const DEFAULT_WEIGHTS = [
  [/food|drink|grocer/i, 45],
  [/transport/i, 10],
  [/educat/i, 8],
  [/personal|health/i, 12],
  [/entertain|fun/i, 9],
  [/shop/i, 8],
  [/emergency/i, 15],
];
const defaultWeight = (name) => DEFAULT_WEIGHTS.find(([p]) => p.test(name))?.[1] ?? 6;

const autoBudgetSchema = {
  type: 'OBJECT',
  properties: {
    allocations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { category: { type: 'STRING' }, amount: { type: 'NUMBER' }, reason: { type: 'STRING' } },
        required: ['category', 'amount', 'reason'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['allocations', 'note'],
};

/**
 * Proposes a monthly budget. The proposal is NOT saved: the user reviews,
 * edits and confirms it. Node guarantees the amounts add up exactly.
 */
export async function autoBudget(user, { month, income, savingsTarget, fixed }) {
  const categories = await prisma.category.findMany({
    where: { userId: user.id, kind: 'expense', archived: false },
    orderBy: { id: 'asc' },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fixedLines = fixed.filter((f) => byId.has(f.categoryId));
  const fixedIds = new Set(fixedLines.map((f) => f.categoryId));

  const incomeCents = toCents(income);
  const savingsCents = toCents(savingsTarget);
  const fixedCents = fixedLines.reduce((sum, f) => sum + toCents(f.amount), 0);
  const distributableCents = incomeCents - savingsCents - fixedCents;
  if (distributableCents < 0) {
    throw new HttpError(400, 'Fixed expenses plus the savings goal are higher than the income.');
  }

  // Average monthly spend over the previous 3 months, per category.
  const historyStart = `${addMonths(month, -3)}-01`;
  const history = await expensesByCategory(user.id, historyStart, `${month}-01`);
  const firstTx = await prisma.transaction.findFirst({ where: { userId: user.id, type: 'expense' }, orderBy: { date: 'asc' } });
  const monthsOfHistory = firstTx ? Math.min(3, Math.max(1, Math.ceil(daysBetween(toIso(firstTx.date), `${month}-01`) / 30))) : 0;

  const flexible = categories.filter((c) => !fixedIds.has(c.id) && !c.isFixed);
  const historyAvg = flexible.map((c) => (monthsOfHistory ? Math.round((history.get(c.id) ?? 0) / monthsOfHistory) : 0));
  const hasHistory = historyAvg.some((v) => v > 0);

  let weights = hasHistory ? historyAvg.map((v, i) => v || (/emergency/i.test(flexible[i].name) ? Math.round(distributableCents * 0.1) : 0)) : flexible.map((c) => defaultWeight(c.name));
  let reasons = flexible.map((c, i) =>
    hasHistory ? (historyAvg[i] ? 'Based on your average spending over the last months.' : 'No recent spending in this category.') : 'Typical share for a student budget.',
  );
  let note = hasHistory
    ? 'Split in proportion to your recent spending.'
    : 'No spending history yet, so this uses a typical student split. Adjust it to your life.';
  let source = 'rules';

  if (geminiEnabled() && distributableCents > 0 && flexible.length > 0) {
    try {
      const raw = await generateJson({
        system: `${BASE_RULES}
Task: propose how to split "amount_to_distribute" across the listed flexible categories for one month.
- Use each category name exactly as given; include only categories that deserve money (you may give 0 to unused ones).
- Amounts should add up to amount_to_distribute. The backend will correct rounding.
- Keep a sensible emergency buffer if an Emergency category exists. Use average_monthly_spend as the main guide when it is available.
- "reason" is one short sentence per category. "note" is one sentence summarising the plan.`,
        contents: JSON.stringify({
          currency: user.currency,
          monthly_income: m(incomeCents),
          savings_target: m(savingsCents),
          fixed_expenses: fixedLines.map((f) => ({ category: byId.get(f.categoryId).name, amount: f.amount })),
          amount_to_distribute: m(distributableCents),
          flexible_categories: flexible.map((c, i) => ({ category: c.name, average_monthly_spend: hasHistory ? m(historyAvg[i]) : null })),
        }),
        schema: autoBudgetSchema,
      });
      const parsed = z
        .object({
          allocations: z.array(z.object({ category: z.string(), amount: z.number().finite(), reason: z.string().max(300) })),
          note: z.string().max(400),
        })
        .parse(raw);
      const byName = new Map(parsed.allocations.map((a) => [a.category.toLowerCase(), a]));
      const aiWeights = flexible.map((c) => Math.max(0, Math.round((byName.get(c.name.toLowerCase())?.amount ?? 0) * 100)));
      if (aiWeights.some((w) => w > 0)) {
        weights = aiWeights;
        reasons = flexible.map((c) => byName.get(c.name.toLowerCase())?.reason ?? 'Not needed this month.');
        note = parsed.note;
        source = 'gemini';
      }
    } catch (err) {
      if (!(err instanceof GeminiError) && !(err instanceof z.ZodError)) throw err;
      console.warn('Gemini auto-budget failed, using rule-based split:', err.message);
    }
  }

  // Exact split in cents: whatever the AI said, the parts always add up.
  const parts = allocate(distributableCents, weights);
  const lines = [
    ...fixedLines.map((f) => ({ categoryId: f.categoryId, name: byId.get(f.categoryId).name, limit: m(toCents(f.amount)), fixed: true, reason: 'Fixed expense you entered.' })),
    ...flexible.map((c, i) => ({ categoryId: c.id, name: c.name, limit: m(parts[i]), fixed: false, reason: reasons[i] })).filter((l) => l.limit > 0),
  ];
  const proposal = { month, income: m(incomeCents), savingsTarget: m(savingsCents), source, note, categories: lines };
  await prisma.aiInsight.create({ data: { userId: user.id, kind: 'auto_budget', month, source, content: proposal } });
  return proposal;
}
