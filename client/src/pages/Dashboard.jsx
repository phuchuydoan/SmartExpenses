import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Sparkles, ChevronRight, CalendarClock, ChartPie, Receipt } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/hooks.jsx';
import { cx, formatDate, formatLongDate, formatMonth, money } from '../lib/format.js';
import { Badge, Button, Card, CardTitle, Empty, ErrorState, Progress, Spinner } from '../components/ui.jsx';
import { CategoryIcon } from '../components/CategoryIcon.jsx';
import { TransactionRow } from '../components/TransactionRow.jsx';

const SeeAll = ({ to, children = 'See all' }) => (
  <Link to={to} className="flex items-center text-sm font-medium text-brand-700 hover:underline">{children}<ChevronRight className="size-4" /></Link>
);

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
      <span className={cx('grid size-9 place-items-center rounded-xl', tone)}><Icon className="size-[18px]" /></span>
      <div>
        <p className="text-xs text-white/60">{label}</p>
        <p className="tabular font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/dashboard');
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const { budget, plan, insight } = data;

  return (
    <div className="animate-rise space-y-5">
      <div>
        <p className="text-sm text-ink-3">{formatLongDate(data.today)}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Hi {user.name.split(' ')[0]} 👋</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Balance */}
        <section className="hero-surface relative overflow-hidden rounded-3xl p-6 text-white shadow-card lg:col-span-2">
          <p className="text-sm text-white/60">Total available balance</p>
          <p className="tabular mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{money(data.balance)}</p>
          <p className="mt-1 text-xs text-white/50">{data.accounts.map((a) => `${a.name} ${money(a.balance)}`).join('  ·  ')}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat icon={ArrowDownLeft} label={`Income · ${formatMonth(data.month, { month: 'short' })}`} value={money(data.income)} tone="bg-brand-500/20 text-brand-400" />
            <Stat icon={ArrowUpRight} label={`Expenses · ${formatMonth(data.month, { month: 'short' })}`} value={money(data.expenses)} tone="bg-rose-500/20 text-rose-300" />
            <Stat icon={PiggyBank} label="Moved to savings" value={money(data.saved)} tone="bg-sky-500/20 text-sky-300" />
          </div>
        </section>

        {/* Today */}
        <Card className="flex flex-col">
          <CardTitle action={<SeeAll to="/planner">Plan</SeeAll>}>Today's spending plan</CardTitle>
          {plan ? (
            <>
              <p className="tabular font-display text-4xl font-semibold tracking-tight">{money(plan.dailyLimit)}</p>
              <p className="text-sm text-ink-3">suggested limit for today</p>
              <Progress className="mt-4" percent={plan.dailyLimit > 0 ? (plan.spentToday / plan.dailyLimit) * 100 : plan.spentToday > 0 ? 101 : 0} />
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-ink-2">Spent <span className="tabular font-medium text-ink">{money(plan.spentToday)}</span></span>
                {plan.status === 'over' ? (
                  <Badge tone="bad">{money(plan.overspent)} over</Badge>
                ) : (
                  <span className="text-ink-2"><span className="tabular font-medium text-brand-700">{money(plan.leftover)}</span> left</span>
                )}
              </div>
              <p className="mt-auto pt-4 text-xs text-ink-3">{plan.daysLeft} days left this month · tomorrow about {money(plan.tomorrowLimit)}</p>
            </>
          ) : (
            <Empty icon={ChartPie} title="No budget for this month" action={<Link to="/budget"><Button variant="brand">Create a budget</Button></Link>}>
              Set a monthly budget and we'll tell you how much you can spend each day.
            </Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Budget */}
        <Card className="lg:col-span-2">
          <CardTitle action={<SeeAll to="/budget">Manage</SeeAll>}>Monthly budget</CardTitle>
          {budget ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <p className="text-sm text-ink-2">
                  <span className="tabular text-2xl font-semibold text-ink">{money(budget.totalSpent)}</span> of {money(budget.totalLimit)}
                </p>
                <Badge tone={budget.percentUsed > 100 ? 'bad' : budget.percentUsed >= 80 ? 'warn' : 'good'}>{budget.percentUsed}% used</Badge>
              </div>
              <Progress className="mt-3" height="h-3" percent={budget.percentUsed} />
              <p className="mt-2 text-sm text-ink-3">
                {budget.remaining >= 0 ? `${money(budget.remaining)} remaining` : `${money(-budget.remaining)} over budget`}
              </p>
              <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {budget.categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tabular shrink-0 text-ink-3">{money(c.spent, { cents: false })} / {money(c.limit, { cents: false })}</span>
                      </div>
                      <Progress className="mt-1.5" height="h-1.5" percent={c.percentUsed} color={c.isFixed && c.remaining >= 0 ? '#64748b' : undefined} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty icon={ChartPie} title="Plan this month" action={<Link to="/budget"><Button variant="brand">Create a budget</Button></Link>}>
              Split your income across categories, or let AI Auto Budget suggest a plan.
            </Empty>
          )}
        </Card>

        {/* AI insight */}
        <Card className="flex flex-col border-brand-100 bg-gradient-to-b from-brand-50/70 to-white">
          <CardTitle action={<Badge tone="good"><Sparkles className="size-3" /> {insight?.source === 'rules' ? 'Smart rules' : 'Gemini'}</Badge>}>AI Insight</CardTitle>
          {insight ? (
            <>
              <p className="text-sm font-medium">{insight.summary}</p>
              {insight.recommendations?.[0] && (
                <div className="mt-3 rounded-xl bg-white p-3 text-sm ring-1 ring-brand-100">
                  <p className="text-ink-2">{insight.recommendations[0].action}</p>
                  {insight.recommendations[0].potential_savings > 0 && (
                    <p className="mt-1 text-xs font-medium text-brand-700">Could save about {money(insight.recommendations[0].potential_savings)}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-2">Get a personal analysis of your spending habits and where you could save.</p>
          )}
          <Link to="/advisor" className="mt-auto pt-4"><Button variant="primary" icon={Sparkles} className="w-full">Open AI Advisor</Button></Link>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle action={<SeeAll to="/transactions" />}>Recent transactions</CardTitle>
          {data.recent.length ? (
            <ul className="divide-y divide-line">{data.recent.map((t) => <li key={t.id}><TransactionRow t={t} /></li>)}</ul>
          ) : (
            <Empty icon={Receipt} title="No transactions yet">Use "Add transaction" to record your first expense or income.</Empty>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle>Upcoming bills</CardTitle>
            {plan?.upcomingBills?.length ? (
              <ul className="space-y-3">
                {plan.upcomingBills.slice(0, 4).map((b) => (
                  <li key={`${b.recurringId}-${b.date}`} className="flex items-center gap-3 text-sm">
                    <span className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><CalendarClock className="size-[18px]" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.description}</p>
                      <p className="text-xs text-ink-3">{formatDate(b.date)}</p>
                    </div>
                    <span className="tabular font-medium">{money(b.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No bills due for the rest of this month.</p>
            )}
          </Card>
          <Card>
            <CardTitle action={<SeeAll to="/goals" />}>Savings goals</CardTitle>
            {data.goals.length ? (
              <ul className="space-y-4">
                {data.goals.slice(0, 3).map((g) => (
                  <li key={g.id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="tabular text-ink-3">{g.percent}%</span>
                    </div>
                    <Progress className="mt-1.5" height="h-1.5" percent={g.percent} color={g.color} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Create a goal to start saving for something that matters.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
