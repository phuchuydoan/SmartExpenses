import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Target, CircleCheck, CalendarDays } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.jsx';
import { cx, formatDate, money } from '../lib/format.js';
import { Badge, Button, Card, Empty, ErrorState, Field, IconButton, Input, Modal, MoneyInput, PageHeader, Progress, Select, Spinner } from '../components/ui.jsx';
import { CategoryIcon, COLORS, ICONS } from '../components/CategoryIcon.jsx';
import { notifyChanged } from '../components/Notifications.jsx';

const GOAL_ICONS = ['target', 'shield', 'laptop', 'plane', 'book', 'home', 'car', 'gift', 'piggy', 'phone'];

function GoalForm({ open, onClose, goal, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setError('');
      setForm(goal ? { name: goal.name, targetAmount: goal.targetAmount.toFixed(2), targetDate: goal.targetDate ?? '', icon: goal.icon, color: goal.color } : { name: '', targetAmount: '', targetDate: '', icon: 'target', color: COLORS[2] });
    }
  }, [open, goal]);
  if (!form) return null;

  async function submit(e) {
    e.preventDefault();
    if (!(Number(form.targetAmount) > 0)) return setError('Enter a target amount');
    setSaving(true);
    try {
      const body = { ...form, targetAmount: Number(form.targetAmount), targetDate: form.targetDate || null };
      await api(goal ? `/goals/${goal.id}` : '/goals', { method: goal ? 'PUT' : 'POST', body });
      toast(goal ? 'Goal updated' : 'Goal created');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="What are you saving for?"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. New laptop" required maxLength={80} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount"><MoneyInput value={form.targetAmount} onChange={(v) => setForm({ ...form, targetAmount: v })} /></Field>
          <Field label="Target date" hint="Optional"><Input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Icon</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((name) => {
              const Icon = ICONS[name];
              return (
                <button type="button" key={name} aria-label={name} aria-pressed={form.icon === name} onClick={() => setForm({ ...form, icon: name })} className={cx('grid size-10 place-items-center rounded-xl border transition-colors', form.icon === name ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-3 hover:bg-canvas')}>
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button type="button" key={color} aria-label={`Colour ${color}`} aria-pressed={form.color === color} onClick={() => setForm({ ...form, color })} className={cx('size-8 rounded-full ring-offset-2 transition-shadow', form.color === color && 'ring-2 ring-ink')} style={{ backgroundColor: color }} />
            ))}
          </div>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="brand" loading={saving}>{goal ? 'Save' : 'Create goal'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ContributeForm({ goal, onClose, onSaved }) {
  const toast = useToast();
  const { data: accounts } = useApi(goal ? '/accounts' : null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (goal) {
      setAmount(goal.perWeek ? goal.perWeek.toFixed(2) : '');
      setError('');
    }
  }, [goal]);
  useEffect(() => {
    if (accounts?.accounts?.length && !accountId) setAccountId(String(accounts.accounts[0].id));
  }, [accounts, accountId]);

  async function submit(e) {
    e.preventDefault();
    if (!(Number(amount) > 0)) return setError('Enter an amount');
    setSaving(true);
    try {
      const data = await api(`/goals/${goal.id}/contribute`, { method: 'POST', body: { amount: Number(amount), accountId: Number(accountId) } });
      toast(data.goal.completed ? `Goal reached: ${goal.name}!` : `${money(Number(amount))} added to ${goal.name}`);
      notifyChanged();
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(goal)} onClose={onClose} title={goal ? `Add money to ${goal.name}` : ''}>
      {goal && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-2">{money(goal.saved)} saved of {money(goal.targetAmount)}. {goal.remaining > 0 && `${money(goal.remaining)} to go.`}</p>
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
          <Field label="From account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {(accounts?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>)}
            </Select>
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="brand" loading={saving}>Add money</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Goals() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/goals');
  const [editing, setEditing] = useState(null);
  const [contributing, setContributing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function remove() {
    try {
      await api(`/goals/${deleting.id}`, { method: 'DELETE' });
      toast('Goal deleted');
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const goals = data.goals;
  const totalSaved = goals.reduce((sum, g) => sum + g.saved, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);

  return (
    <div className="animate-rise">
      <PageHeader title="Financial Goals" subtitle="Give your savings a purpose and a deadline.">
        <Button variant="brand" icon={Plus} onClick={() => setEditing('new')}>New goal</Button>
      </PageHeader>

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-line bg-white shadow-card">
        <img src="/images/goals.jpg" alt="" className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover sm:block" onError={(e) => e.currentTarget.remove()} />
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-r from-white via-white/60 to-transparent sm:block" />
        <div className="relative p-6 sm:max-w-[55%]">
          <p className="text-sm text-ink-3">Total saved across {goals.length} goal{goals.length === 1 ? '' : 's'}</p>
          <p className="tabular mt-1 font-display text-4xl font-semibold tracking-tight">{money(totalSaved)}</p>
          {totalTarget > 0 && (
            <>
              <Progress className="mt-4" height="h-2.5" percent={(totalSaved / totalTarget) * 100} color="#059669" />
              <p className="mt-2 text-sm text-ink-2">{Math.floor((totalSaved / totalTarget) * 100)}% of {money(totalTarget)}</p>
            </>
          )}
        </div>
      </section>

      {goals.length === 0 ? (
        <Card><Empty icon={Target} title="No goals yet" action={<Button variant="brand" onClick={() => setEditing('new')}>Create your first goal</Button>}>An emergency fund, next semester's tuition, a new laptop - set a target and we'll tell you how much to put aside each week.</Empty></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <Card key={g.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <CategoryIcon icon={g.icon} color={g.color} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <CalendarDays className="size-3.5" />
                    {g.targetDate ? `By ${formatDate(g.targetDate, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No deadline'}
                  </p>
                </div>
                <IconButton label="Edit goal" icon={Pencil} onClick={() => setEditing(g)} />
                <IconButton label="Delete goal" icon={Trash2} className="hover:!bg-red-50 hover:text-red-600" onClick={() => setDeleting(g)} />
              </div>
              <div className="mt-5 flex items-end justify-between">
                <p className="tabular text-2xl font-semibold">{money(g.saved)}</p>
                <p className="tabular text-sm text-ink-3">of {money(g.targetAmount)}</p>
              </div>
              <Progress className="mt-2" height="h-2.5" percent={g.percent} color={g.color} />
              <div className="mt-3 min-h-[2.75rem] text-sm">
                {g.completed ? (
                  <Badge tone="good"><CircleCheck className="size-3.5" /> Goal reached</Badge>
                ) : g.overdue ? (
                  <Badge tone="warn">Target date passed · {money(g.remaining)} to go</Badge>
                ) : g.perWeek ? (
                  <p className="text-ink-2">Save <span className="tabular font-semibold text-ink">{money(g.perWeek)}</span> a week (<span className="tabular">{money(g.perDay)}</span>/day) to get there in {g.daysLeft} days.</p>
                ) : (
                  <p className="text-ink-3">{money(g.remaining)} to go. Add a target date to get a weekly plan.</p>
                )}
              </div>
              {!g.completed && <Button variant="secondary" icon={Plus} className="mt-4" onClick={() => setContributing(g)}>Add money</Button>}
            </Card>
          ))}
        </div>
      )}

      <GoalForm open={Boolean(editing)} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      <ContributeForm goal={contributing} onClose={() => setContributing(null)} onSaved={reload} />
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete goal?" footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
        {deleting && <p className="text-sm text-ink-2">"{deleting.name}" will be removed. The {money(deleting.saved)} you moved into it stays in your transaction history as savings.</p>}
      </Modal>
    </div>
  );
}
