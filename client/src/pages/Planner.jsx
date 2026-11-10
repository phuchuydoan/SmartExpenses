import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, PiggyBank, CalendarClock, ArrowRight, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.jsx';
import { formatDate, formatLongDate, money } from '../lib/format.js';
import { Badge, Button, Card, CardTitle, Empty, ErrorState, Field, Modal, MoneyInput, PageHeader, Progress, Select, Spinner } from '../components/ui.jsx';
import { CategoryIcon } from '../components/CategoryIcon.jsx';
import { notifyChanged } from '../components/Notifications.jsx';

function SweepModal({ open, onClose, plan, onDone }) {
  const toast = useToast();
  const { data: goals } = useApi(open ? '/goals' : null);
  const { data: accounts } = useApi(open ? '/accounts' : null);
  const [goalId, setGoalId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(plan.leftover.toFixed(2));
      setError('');
    }
  }, [open, plan.leftover]);
  useEffect(() => {
    if (goals?.goals?.length && !goalId) setGoalId(String((goals.goals.find((g) => !g.completed) ?? goals.goals[0]).id));
    if (accounts?.accounts?.length && !accountId) setAccountId(String(accounts.accounts[0].id));
  }, [goals, accounts, goalId, accountId]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/planner/sweep', { method: 'POST', body: { goalId: Number(goalId), accountId: Number(accountId), amount: Number(amount) } });
      toast(`${money(Number(amount))} moved to savings`);
      notifyChanged();
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const list = goals?.goals ?? [];
  return (
    <Modal open={open} onClose={onClose} title="Move leftover to savings">
      {goals && list.length === 0 ? (
        <Empty icon={PiggyBank} title="Create a savings goal first" action={<Link to="/goals"><Button variant="brand">Go to Goals</Button></Link>}>
          You need a goal to move money into.
        </Empty>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-2">You have <span className="font-medium text-ink">{money(plan.leftover)}</span> left from today's allowance. Money you move is taken out of this month's spending plan.</p>
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} required /></Field>
          <Field label="Savings goal">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)} required>
              {list.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.percent}%)</option>)}
            </Select>
          </Field>
          <Field label="From account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {(accounts?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>)}
            </Select>
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="brand" loading={saving}>Move to savings</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Planner() {
  const { data, error, loading, reload } = useApi('/planner/today');
  const [sweeping, setSweeping] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const plan = data.plan;

  if (!plan) {
    return (
      <div className="animate-rise">
        <PageHeader title="Daily Planner" />
        <Card>
          <Empty icon={CalendarDays} title="Your daily plan starts with a budget" action={<Link to="/budget"><Button variant="brand">Create this month's budget</Button></Link>}>
            Once you set a monthly budget, we work out how much you can spend each day.
          </Empty>
        </Card>
      </div>
    );
  }

  const used = plan.dailyLimit > 0 ? (plan.spentToday / plan.dailyLimit) * 100 : plan.spentToday > 0 ? 101 : 0;
  const statusBadge = { on_track: ['good', 'On track'], near_limit: ['warn', 'Close to the limit'], over: ['bad', 'Over today\'s limit'] }[plan.status];

  return (
    <div className="animate-rise">
      <PageHeader title="Daily Planner" subtitle={formatLongDate(plan.date)} />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="hero-surface rounded-3xl p-6 text-white shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Today's spending plan</p>
            <Badge tone={statusBadge[0]}>{statusBadge[1]}</Badge>
          </div>
          <p className="tabular mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">{money(plan.dailyLimit)}</p>
          <p className="mt-1 text-sm text-white/60">Suggested daily spending limit</p>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, used)}%`, backgroundColor: plan.status === 'over' ? '#f87171' : plan.status === 'near_limit' ? '#fbbf24' : '#34d399' }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-white/55">Spent today</p><p className="tabular text-lg font-semibold">{money(plan.spentToday)}</p></div>
            <div><p className="text-white/55">{plan.status === 'over' ? 'Over by' : 'Left today'}</p><p className="tabular text-lg font-semibold">{money(plan.status === 'over' ? plan.overspent : plan.leftover)}</p></div>
            <div><p className="text-white/55">Tomorrow</p><p className="tabular text-lg font-semibold">{money(plan.tomorrowLimit)}</p></div>
          </div>
          {plan.leftover > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
              <p className="max-w-md text-sm text-white/75">Not planning to spend the rest? Move it to a savings goal, or leave it and it is spread over the next {Math.max(plan.daysLeft - 1, 0)} days.</p>
              <Button variant="brand" icon={PiggyBank} onClick={() => setSweeping(true)}>Move {money(plan.leftover)} to savings</Button>
            </div>
          ) : plan.status === 'over' ? (
            <p className="mt-6 rounded-2xl bg-white/[0.07] p-4 text-sm text-white/75 ring-1 ring-white/10">
              No problem - the plan adjusts. To stay on budget, the next days drop to about {money(plan.tomorrowLimit)} each.
            </p>
          ) : null}
        </section>

        <Card>
          <CardTitle>How it's calculated</CardTitle>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-2">Flexible budget left</dt><dd className="tabular font-medium">{money(plan.pool + plan.reserved)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-2">Set aside for upcoming bills</dt><dd className="tabular font-medium">- {money(plan.reserved)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-line pt-2.5"><dt className="text-ink-2">Available to spend</dt><dd className="tabular font-medium">{money(plan.pool)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-2">Days left (incl. today)</dt><dd className="tabular font-medium">÷ {plan.daysLeft}</dd></div>
            <div className="flex justify-between gap-3 border-t border-line pt-2.5"><dt className="font-medium">Daily limit</dt><dd className="tabular font-semibold text-brand-700">{money(plan.dailyLimit)}</dd></div>
          </dl>
          <p className="mt-4 flex gap-2 rounded-xl bg-canvas p-3 text-xs text-ink-2">
            <Info className="mt-px size-3.5 shrink-0" />
            Fixed costs such as rent are not part of the daily limit. The limit is recalculated every morning from what is really left.
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle hint="Your daily limit, split in proportion to what is left in each category.">Suggested split for today</CardTitle>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {plan.categories.filter((c) => c.suggested > 0 || c.spentToday > 0).map((c) => (
              <li key={c.categoryId} className="flex items-center gap-3">
                <CategoryIcon icon={c.icon} color={c.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="tabular shrink-0 font-semibold">{money(c.suggested)}</span>
                  </div>
                  <Progress className="mt-1.5" height="h-1.5" percent={c.suggested > 0 ? (c.spentToday / c.suggested) * 100 : c.spentToday > 0 ? 101 : 0} />
                  <p className="mt-1 text-xs text-ink-3">{c.spentToday > 0 ? `${money(c.spentToday)} spent today` : 'Nothing spent yet'} · {money(Math.max(0, c.monthRemaining))} left this month</p>
                </div>
              </li>
            ))}
          </ul>
          {plan.unbudgetedToday > 0 && <p className="mt-4 text-xs text-amber-700">{money(plan.unbudgetedToday)} spent today in categories without a budget also counts against today's limit.</p>}
        </Card>

        <Card>
          <CardTitle action={<Link to="/settings" className="flex items-center text-sm font-medium text-brand-700 hover:underline">Manage<ArrowRight className="ml-0.5 size-3.5" /></Link>}>Bills still due this month</CardTitle>
          {plan.upcomingBills.length ? (
            <ul className="space-y-3">
              {plan.upcomingBills.map((b) => (
                <li key={`${b.recurringId}-${b.date}`} className="flex items-center gap-3 text-sm">
                  <span className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><CalendarClock className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.description}</p><p className="text-xs text-ink-3">{formatDate(b.date)}</p></div>
                  <span className="tabular font-medium">{money(b.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Nothing else is due this month.</p>
          )}
        </Card>
      </div>

      <SweepModal open={sweeping} onClose={() => setSweeping(false)} plan={plan} onDone={reload} />
    </div>
  );
}
