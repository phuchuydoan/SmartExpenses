import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Repeat, ChartPie, ChartColumn, Target, LogOut, Check, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useToast, useAlertToasts } from '../lib/hooks.jsx';
import { cx, formatDate, money } from '../lib/format.js';
import { Badge, Button, Card, CardTitle, Field, IconButton, Input, Modal, MoneyInput, PageHeader, Segmented, Select, Toggle } from '../components/ui.jsx';
import { CategoryIcon, COLORS, ICONS } from '../components/CategoryIcon.jsx';
import { notifyChanged } from '../components/Notifications.jsx';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'JPY', 'AUD', 'CAD', 'SGD', 'KRW', 'INR'];
const THRESHOLDS = [50, 70, 80, 90, 100];
const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Ho_Chi_Minh', 'Asia/Tokyo'];
  }
})();
const FREQUENCIES = { weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month', yearly: 'Every year' };
const ACCOUNT_TYPES = { cash: 'Cash', bank: 'Bank account', credit_card: 'Credit card', ewallet: 'E-wallet' };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function useSave(fn, onDone) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (...args) => {
    setSaving(true);
    setError('');
    try {
      const message = await fn(...args);
      if (message) toast(message);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return { run, saving, error, setError };
}

const ErrorNote = ({ children }) => (children ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null);

// ---------- Profile
function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, currency: user.currency, timezone: user.timezone });
  const { run, saving, error } = useSave(async () => {
    const data = await api('/auth/me', { method: 'PATCH', body: form });
    setUser(data.user);
    return 'Profile saved';
  });
  return (
    <Card>
      <CardTitle>Profile</CardTitle>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></Field>
        <Field label="Email"><Input value={user.email} disabled className="bg-canvas text-ink-3" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {[...new Set([user.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Timezone" hint="Decides when your day starts">
            <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {[...new Set([user.timezone, ...TIMEZONES])].map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={saving}>Save profile</Button>
      </form>
    </Card>
  );
}

// ---------- Alerts
function Alerts() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const update = async (patch) => {
    try {
      const data = await api('/auth/me', { method: 'PATCH', body: patch });
      setUser(data.user);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };
  const thresholds = user.alertThresholds ?? [];
  const toggle = (t) => update({ alertThresholds: thresholds.includes(t) ? thresholds.filter((x) => x !== t) : [...thresholds, t] });
  const rows = [
    ['notifyUnusual', 'Unusual spending', 'When a category runs well above your weekly average.'],
    ['notifyWeekly', 'Weekly report', 'A summary of last week every Monday.'],
  ];
  return (
    <Card>
      <CardTitle hint="Choose when SmartSpend should warn you.">Notifications & alerts</CardTitle>
      <p className="text-sm font-medium text-ink-2">Budget alerts at</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {THRESHOLDS.map((t) => {
          const on = thresholds.includes(t);
          return (
            <button key={t} aria-pressed={on} onClick={() => toggle(t)} className={cx('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-2 hover:bg-canvas')}>
              {on && <Check className="size-3.5" />}{t}%
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-3">You are always told when you actually go over a budget, whatever you pick here.</p>
      <div className="mt-5 space-y-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium">Bill reminders</p><p className="text-xs text-ink-3">How early to remind you about recurring bills.</p></div>
          <Select className="!w-36" value={user.billReminderDays} onChange={(e) => update({ billReminderDays: Number(e.target.value) })} aria-label="Bill reminder lead time">
            {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? 'On the day' : `${d} day${d > 1 ? 's' : ''} before`}</option>)}
          </Select>
        </div>
        {rows.map(([key, title, text]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-ink-3">{text}</p></div>
            <Toggle checked={user[key]} onChange={(v) => update({ [key]: v })} label={title} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Recurring
function RecurringForm({ open, item, onClose, onSaved, categories, accounts }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? { ...item, amount: item.amount.toFixed(2), categoryId: item.categoryId ?? '', endDate: item.endDate ?? '' }
        : { type: 'expense', amount: '', description: '', frequency: 'monthly', nextDueDate: localToday(), endDate: '', autoPost: true, active: true, accountId: accounts[0]?.id ?? '', categoryId: '' },
    );
  }, [open, item, accounts]);
  const { run, saving, error, setError } = useSave(async () => {
    if (!(Number(form.amount) > 0)) throw new Error('Enter an amount');
    const body = {
      type: form.type, amount: Number(form.amount), description: form.description, frequency: form.frequency, nextDueDate: form.nextDueDate,
      endDate: form.endDate || null, autoPost: form.autoPost, active: form.active, accountId: Number(form.accountId), categoryId: form.categoryId ? Number(form.categoryId) : null,
    };
    await api(item ? `/recurring/${item.id}` : '/recurring', { method: item ? 'PUT' : 'POST', body });
    notifyChanged();
    onSaved();
    onClose();
    return item ? 'Recurring transaction updated' : 'Recurring transaction added';
  });
  useEffect(() => { if (open) setError(''); }, [open, setError]);
  if (!form) return null;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit recurring transaction' : 'New recurring transaction'}>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
        <Segmented className="flex w-full" value={form.type} onChange={(type) => setForm((f) => ({ ...f, type, categoryId: '' }))} options={[{ value: 'expense', label: 'Bill / expense' }, { value: 'income', label: 'Income' }]} />
        <Field label="Description"><Input value={form.description} onChange={set('description')} placeholder="e.g. Rent, Phone plan, Allowance" required maxLength={255} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><MoneyInput value={form.amount} onChange={set('amount')} /></Field>
          <Field label="Repeats"><Select value={form.frequency} onChange={set('frequency')}>{Object.entries(FREQUENCIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Next date"><Input type="date" value={form.nextDueDate} onChange={set('nextDueDate')} required /></Field>
          <Field label="Ends" hint="Optional"><Input type="date" value={form.endDate} onChange={set('endDate')} /></Field>
          <Field label="Category">
            <Select value={form.categoryId} onChange={set('categoryId')}>
              <option value="">None</option>
              {categories.filter((c) => c.kind === form.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Account"><Select value={form.accountId} onChange={set('accountId')} required>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-canvas p-3">
          <div><p className="text-sm font-medium">Record automatically</p><p className="text-xs text-ink-3">Off: you get a reminder and mark it as paid yourself.</p></div>
          <Toggle checked={form.autoPost} onChange={set('autoPost')} label="Record automatically" />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="brand" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function Recurring({ categories, accounts }) {
  const toast = useToast();
  const showAlerts = useAlertToasts();
  const { data, reload } = useApi('/recurring');
  const [editing, setEditing] = useState(null);
  const items = data?.recurring ?? [];

  const pay = async (r) => {
    try {
      const result = await api(`/recurring/${r.id}/pay`, { method: 'POST' });
      toast(`${r.description} recorded. Next: ${formatDate(result.nextDueDate)}`);
      showAlerts(result.alerts);
      notifyChanged();
      reload();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };
  const remove = async (r) => {
    if (!window.confirm(`Stop and delete "${r.description}"? Past transactions are kept.`)) return;
    await api(`/recurring/${r.id}`, { method: 'DELETE' }).catch((err) => toast(err.message, { type: 'error' }));
    notifyChanged();
    reload();
  };

  return (
    <Card className="lg:col-span-2">
      <CardTitle hint="Rent, subscriptions, allowance - recorded for you or reminded before they are due." action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing('new')}>Add</Button>}>
        Recurring transactions & bills
      </CardTitle>
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing recurring yet. Add your rent or subscriptions so the daily plan can set money aside for them.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r) => (
            <li key={r.id} className={cx('flex flex-wrap items-center gap-3 py-3', !r.active && 'opacity-50')}>
              {r.category ? <CategoryIcon icon={r.category.icon} color={r.category.color} /> : <span className="grid size-10 place-items-center rounded-xl bg-canvas text-ink-3"><Repeat className="size-5" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.description}</p>
                <p className="text-xs text-ink-3">{FREQUENCIES[r.frequency]} · {r.active ? `next ${formatDate(r.nextDueDate)}` : 'ended'} · {r.autoPost ? 'automatic' : 'manual'}</p>
              </div>
              <span className={cx('tabular text-sm font-semibold', r.type === 'income' && 'text-brand-700')}>{r.type === 'income' ? '+' : '-'}{money(r.amount)}</span>
              <div className="flex items-center">
                {r.active && !r.autoPost && <Button size="sm" variant="secondary" onClick={() => pay(r)}>{r.type === 'income' ? 'Mark received' : 'Mark as paid'}</Button>}
                <IconButton label="Edit" icon={Pencil} onClick={() => setEditing(r)} />
                <IconButton label="Delete" icon={Trash2} className="hover:!bg-red-50 hover:text-red-600" onClick={() => remove(r)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <RecurringForm open={Boolean(editing)} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} categories={categories} accounts={accounts} />
    </Card>
  );
}

// ---------- Categories
function CategoryForm({ open, item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (open) setForm(item ? { ...item } : { name: '', kind: 'expense', icon: 'tag', color: COLORS[0], isFixed: false });
  }, [open, item]);
  const { run, saving, error, setError } = useSave(async () => {
    const { name, kind, icon, color, isFixed } = form;
    await api(item ? `/categories/${item.id}` : '/categories', { method: item ? 'PUT' : 'POST', body: item ? { name, icon, color, isFixed } : { name, kind, icon, color, isFixed } });
    onSaved();
    onClose();
    return item ? 'Category updated' : 'Category added';
  });
  useEffect(() => { if (open) setError(''); }, [open, setError]);
  if (!form) return null;
  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit category' : 'New category'}>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
        {!item && <Segmented className="flex w-full" value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />}
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} autoFocus /></Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ICONS).map(([name, Icon]) => (
              <button type="button" key={name} aria-label={name} aria-pressed={form.icon === name} onClick={() => setForm({ ...form, icon: name })} className={cx('grid size-9 place-items-center rounded-lg border', form.icon === name ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-3 hover:bg-canvas')}>
                <Icon className="size-[18px]" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => <button type="button" key={color} aria-label={`Colour ${color}`} aria-pressed={form.color === color} onClick={() => setForm({ ...form, color })} className={cx('size-8 rounded-full ring-offset-2', form.color === color && 'ring-2 ring-ink')} style={{ backgroundColor: color }} />)}
          </div>
        </div>
        {form.kind === 'expense' && (
          <div className="flex items-center justify-between gap-4 rounded-xl bg-canvas p-3">
            <div><p className="text-sm font-medium">Fixed cost</p><p className="text-xs text-ink-3">Rent, tuition... Left out of the daily spending limit.</p></div>
            <Toggle checked={form.isFixed} onChange={(isFixed) => setForm({ ...form, isFixed })} label="Fixed cost" />
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="brand" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function Categories({ categories, reload }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const remove = async (c) => {
    if (!window.confirm(`Delete the category "${c.name}"? Existing transactions keep their history.`)) return;
    await api(`/categories/${c.id}`, { method: 'DELETE' }).then(() => toast('Category deleted')).catch((err) => toast(err.message, { type: 'error' }));
    reload();
  };
  return (
    <Card>
      <CardTitle action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing('new')}>Add</Button>}>Categories</CardTitle>
      {['expense', 'income'].map((kind) => (
        <div key={kind} className="mb-4 last:mb-0">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{kind}</p>
          <ul className="divide-y divide-line">
            {categories.filter((c) => c.kind === kind).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                {c.isFixed && <Badge>Fixed</Badge>}
                <IconButton label={`Edit ${c.name}`} icon={Pencil} onClick={() => setEditing(c)} />
                <IconButton label={`Delete ${c.name}`} icon={Trash2} className="hover:!bg-red-50 hover:text-red-600" onClick={() => remove(c)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <CategoryForm open={Boolean(editing)} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
    </Card>
  );
}

// ---------- Accounts
function Accounts({ accounts, reload }) {
  const toast = useToast();
  const [form, setForm] = useState(null); // { id?, name, type, openingBalance }
  const { run, saving, error, setError } = useSave(async () => {
    const body = { name: form.name, type: form.type, ...(form.id ? {} : { openingBalance: Number(form.openingBalance) || 0 }) };
    await api(form.id ? `/accounts/${form.id}` : '/accounts', { method: form.id ? 'PUT' : 'POST', body });
    reload();
    setForm(null);
    return form.id ? 'Account updated' : 'Account added';
  });
  const remove = async (a) => {
    if (!window.confirm(`Remove the account "${a.name}"?`)) return;
    await api(`/accounts/${a.id}`, { method: 'DELETE' }).then(() => toast('Account removed')).catch((err) => toast(err.message, { type: 'error' }));
    reload();
  };
  return (
    <Card>
      <CardTitle action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => { setError(''); setForm({ name: '', type: 'cash', openingBalance: '' }); }}>Add</Button>}>Accounts & wallets</CardTitle>
      <ul className="divide-y divide-line">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-canvas text-ink-2"><Wallet className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name}</p><p className="text-xs text-ink-3">{ACCOUNT_TYPES[a.type]}</p></div>
            <span className="tabular text-sm font-semibold">{money(a.balance)}</span>
            <IconButton label={`Rename ${a.name}`} icon={Pencil} onClick={() => { setError(''); setForm({ id: a.id, name: a.name, type: a.type }); }} />
            <IconButton label={`Remove ${a.name}`} icon={Trash2} className="hover:!bg-red-50 hover:text-red-600" onClick={() => remove(a)} />
          </li>
        ))}
      </ul>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit account' : 'New account'}>
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} autoFocus /></Field>
            <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(ACCOUNT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {!form.id && <Field label="Current balance" hint="What is in this account right now"><MoneyInput value={form.openingBalance} onChange={(v) => setForm({ ...form, openingBalance: v })} /></Field>}
            <ErrorNote>{error}</ErrorNote>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" variant="brand" loading={saving}>Save</Button></div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

// ---------- Password
function Password() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const { run, saving, error } = useSave(async () => {
    await api('/auth/me/password', { method: 'POST', body: form });
    setForm({ currentPassword: '', newPassword: '' });
    return 'Password changed';
  });
  return (
    <Card>
      <CardTitle>Password</CardTitle>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></Field>
        <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required minLength={8} maxLength={72} /></Field>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" loading={saving}>Change password</Button>
      </form>
    </Card>
  );
}

export default function Settings() {
  const { logout } = useAuth();
  const cats = useApi('/categories');
  const accts = useApi('/accounts');
  const categories = cats.data?.categories ?? [];
  const accounts = accts.data?.accounts ?? [];
  const more = [['/budget', 'Budget Planner', ChartPie], ['/analytics', 'Analytics', ChartColumn], ['/goals', 'Goals', Target]];

  return (
    <div className="animate-rise">
      <PageHeader title="Settings" subtitle="Your account, alerts and the building blocks of your budget." />
      <div className="mb-5 grid grid-cols-3 gap-3 lg:hidden">
        {more.map(([to, label, Icon]) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-4 text-center text-xs font-medium shadow-card">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-5" /></span>
            {label}
          </Link>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Profile />
        <Alerts />
        <Recurring categories={categories} accounts={accounts} />
        <Categories categories={categories} reload={cats.reload} />
        <div className="space-y-5">
          <Accounts accounts={accounts} reload={accts.reload} />
          <Password />
          <Button variant="secondary" icon={LogOut} className="w-full" onClick={logout}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
