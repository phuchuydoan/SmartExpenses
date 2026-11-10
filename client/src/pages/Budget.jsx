import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, Trash2, Pencil, Copy, ChartPie, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useToast, useAlertToasts } from '../lib/hooks.jsx';
import { formatMonth, money, shiftMonth } from '../lib/format.js';
import { Badge, Button, Card, CardTitle, Empty, ErrorState, Field, IconButton, Modal, MoneyInput, MonthPicker, PageHeader, Progress, Select, Spinner } from '../components/ui.jsx';
import { CategoryIcon } from '../components/CategoryIcon.jsx';
import { notifyChanged } from '../components/Notifications.jsx';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const num = (s) => Number(s) || 0;
const fix = (n) => (n ? Number(n).toFixed(2) : '');

/** Step 1 of AI Auto Budget: what the AI needs to know. Step 2: review the proposal. */
function AutoBudget({ open, onClose, month, categories, initial, onUse }) {
  const [income, setIncome] = useState('');
  const [savings, setSavings] = useState('');
  const [fixed, setFixed] = useState({});
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fixedCategories = categories.filter((c) => c.isFixed);

  useEffect(() => {
    if (!open) return;
    setProposal(null);
    setError('');
    setIncome(initial.income || '');
    setSavings(initial.savingsTarget || '');
    setFixed(Object.fromEntries(initial.lines.filter((l) => fixedCategories.some((c) => c.id === Number(l.categoryId))).map((l) => [l.categoryId, l.limit])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate() {
    if (!(num(income) > 0)) return setError('Enter your monthly income first');
    setLoading(true);
    setError('');
    try {
      const data = await api('/ai/auto-budget', {
        method: 'POST',
        body: {
          month,
          income: num(income),
          savingsTarget: num(savings),
          fixed: Object.entries(fixed).filter(([, v]) => num(v) > 0).map(([categoryId, amount]) => ({ categoryId: Number(categoryId), amount: num(amount) })),
        },
      });
      setProposal(data.proposal);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="AI Auto Budget" wide>
      {!proposal ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Tell us the basics. The AI looks at your income, fixed costs, savings goal and past spending, then suggests a split. You can edit everything before saving.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monthly income"><MoneyInput value={income} onChange={setIncome} autoFocus /></Field>
            <Field label="Savings goal this month"><MoneyInput value={savings} onChange={setSavings} /></Field>
          </div>
          {fixedCategories.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-2">Fixed expenses</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {fixedCategories.map((c) => (
                  <Field key={c.id} label={c.name}>
                    <MoneyInput value={fixed[c.id] ?? ''} onChange={(v) => setFixed((f) => ({ ...f, [c.id]: v }))} />
                  </Field>
                ))}
              </div>
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="brand" icon={Sparkles} loading={loading} onClick={generate}>{loading ? 'Thinking...' : 'Suggest a budget'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <p>{proposal.note} <span className="text-brand-700/70">({proposal.source === 'gemini' ? 'Suggested by Gemini' : 'Suggested by built-in rules'}; amounts are checked to add up exactly.)</span></p>
          </div>
          <ul className="divide-y divide-line">
            {proposal.categories.map((c) => (
              <li key={c.categoryId} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">{c.name}{c.fixed && <Lock className="size-3 text-ink-3" />}</p>
                  <p className="text-xs text-ink-3">{c.reason}</p>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold">{money(c.limit)}</span>
              </li>
            ))}
            <li className="flex justify-between py-2.5 text-sm"><span className="font-medium">Savings</span><span className="tabular font-semibold">{money(proposal.savingsTarget)}</span></li>
            <li className="flex justify-between py-2.5 text-sm"><span className="text-ink-3">Total = income</span><span className="tabular font-semibold">{money(proposal.income)}</span></li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setProposal(null)}>Back</Button>
            <Button variant="brand" onClick={() => { onUse(proposal); onClose(); }}>Review and edit</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Editor({ month, categories, draft, setDraft, onCancel, onSaved, canCancel }) {
  const toast = useToast();
  const showAlerts = useAlertToasts();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);

  const used = new Set(draft.lines.map((l) => Number(l.categoryId)));
  const available = categories.filter((c) => !used.has(c.id));
  const allocated = draft.lines.reduce((sum, l) => sum + Math.round(num(l.limit) * 100), 0) / 100;
  const unallocated = Math.round((num(draft.income) - num(draft.savingsTarget) - allocated) * 100) / 100;

  const setLine = (i, patch) => setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  async function save() {
    const lines = draft.lines.filter((l) => l.categoryId && num(l.limit) > 0);
    if (!lines.length) return setError('Add at least one category with a limit');
    setSaving(true);
    setError('');
    try {
      const result = await api(`/budgets/${month}`, {
        method: 'PUT',
        body: { income: num(draft.income), savingsTarget: num(draft.savingsTarget), categories: lines.map((l) => ({ categoryId: Number(l.categoryId), limit: num(l.limit) })) },
      });
      toast('Budget saved');
      showAlerts(result.alerts);
      notifyChanged();
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardTitle hint="Set a limit for each category. Fixed costs like rent are kept out of your daily spending plan." action={<Button variant="secondary" size="sm" icon={Sparkles} onClick={() => setAuto(true)}>AI Auto Budget</Button>}>
          {formatMonth(month)} budget
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly income"><MoneyInput value={draft.income} onChange={(v) => setDraft((d) => ({ ...d, income: v }))} /></Field>
          <Field label="Savings goal"><MoneyInput value={draft.savingsTarget} onChange={(v) => setDraft((d) => ({ ...d, savingsTarget: v }))} /></Field>
        </div>
        <p className="mb-2 mt-6 text-sm font-medium text-ink-2">Categories</p>
        <ul className="space-y-2">
          {draft.lines.map((line, i) => {
            const options = categories.filter((c) => c.id === Number(line.categoryId) || !used.has(c.id));
            return (
              <li key={i} className="grid grid-cols-[1fr_8.5rem_2.25rem] items-center gap-2">
                <Select value={line.categoryId} onChange={(e) => setLine(i, { categoryId: e.target.value })} aria-label="Category">
                  <option value="" disabled>Choose a category...</option>
                  {options.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isFixed ? ' (fixed)' : ''}</option>)}
                </Select>
                <MoneyInput value={line.limit} onChange={(v) => setLine(i, { limit: v })} aria-label="Monthly limit" />
                <IconButton label="Remove" icon={Trash2} onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))} />
              </li>
            );
          })}
        </ul>
        {available.length > 0 && (
          <Button variant="ghost" size="sm" icon={Plus} className="mt-3" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { categoryId: '', limit: '' }] }))}>Add category</Button>
        )}
        {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </Card>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardTitle>Summary</CardTitle>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-2">Income</dt><dd className="tabular font-medium">{money(num(draft.income))}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-2">Savings goal</dt><dd className="tabular font-medium">- {money(num(draft.savingsTarget))}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-2">Category limits</dt><dd className="tabular font-medium">- {money(allocated)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2.5">
            <dt className="font-medium">{unallocated >= 0 ? 'Left to assign' : 'Over income by'}</dt>
            <dd className={`tabular font-semibold ${unallocated < 0 ? 'text-red-600' : unallocated === 0 ? 'text-brand-700' : ''}`}>{money(Math.abs(unallocated))}</dd>
          </div>
        </dl>
        {unallocated < 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Your plan spends more than your income. You can still save it, but consider lowering a limit.</p>}
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="brand" loading={saving} onClick={save}>Save budget</Button>
          {canCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        </div>
      </Card>

      <AutoBudget
        open={auto}
        onClose={() => setAuto(false)}
        month={month}
        categories={categories}
        initial={draft}
        onUse={(p) => setDraft({ income: fix(p.income), savingsTarget: fix(p.savingsTarget), lines: p.categories.map((c) => ({ categoryId: String(c.categoryId), limit: fix(c.limit) })) })}
      />
    </div>
  );
}

export default function Budget() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const { data, error, loading, reload } = useApi(`/budgets/${month}`);
  const { data: cats } = useApi('/categories');
  const [draft, setDraft] = useState(null);
  const categories = useMemo(() => (cats?.categories ?? []).filter((c) => c.kind === 'expense'), [cats]);
  const budget = data?.budget;

  useEffect(() => setDraft(null), [month]);

  const startEditing = () =>
    setDraft(
      budget
        ? { income: fix(budget.income), savingsTarget: fix(budget.savingsTarget), lines: budget.categories.map((c) => ({ categoryId: String(c.categoryId), limit: fix(c.limit) })) }
        : { income: '', savingsTarget: '', lines: categories.filter((c) => c.isFixed).slice(0, 1).map((c) => ({ categoryId: String(c.id), limit: '' })).concat({ categoryId: '', limit: '' }) },
    );

  async function copyPrevious() {
    try {
      await api(`/budgets/${month}/copy-previous`, { method: 'POST' });
      toast(`Copied your ${formatMonth(data.previousMonth)} budget`);
      reload();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Budget Planner" subtitle="Decide where your money goes before the month begins.">
        <MonthPicker month={month} onChange={setMonth} max={shiftMonth(thisMonth(), 12)} />
        {budget && !draft && <Button variant="secondary" icon={Pencil} onClick={startEditing}>Edit budget</Button>}
      </PageHeader>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : draft ? (
        <Editor month={month} categories={categories} draft={draft} setDraft={setDraft} canCancel onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); reload(); }} />
      ) : !budget ? (
        <Card>
          <Empty
            icon={ChartPie}
            title={`No budget for ${formatMonth(month)} yet`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="brand" icon={Plus} onClick={startEditing}>Create budget</Button>
                {data.previousMonth && <Button variant="secondary" icon={Copy} onClick={copyPrevious}>Copy {formatMonth(data.previousMonth, { month: 'long' })}</Button>}
              </div>
            }
          >
            Enter your income, savings goal and a limit per category - or open the editor and let AI Auto Budget suggest a split.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="h-fit">
            <CardTitle>Overview</CardTitle>
            <p className="tabular font-display text-3xl font-semibold tracking-tight">{money(budget.remaining >= 0 ? budget.remaining : -budget.remaining)}</p>
            <p className="text-sm text-ink-3">{budget.remaining >= 0 ? 'left to spend this month' : 'over budget this month'}</p>
            <Progress className="mt-4" height="h-3" percent={budget.percentUsed} />
            <p className="mt-2 text-sm text-ink-2">{money(budget.totalSpent)} of {money(budget.totalLimit)} · {budget.percentUsed}% used</p>
            <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Planned income</dt><dd className="tabular font-medium">{money(budget.income)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Savings goal</dt><dd className="tabular font-medium">{money(budget.saved)} / {money(budget.savingsTarget)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">{budget.unallocated >= 0 ? 'Not assigned' : 'Over-assigned'}</dt><dd className="tabular font-medium">{money(Math.abs(budget.unallocated))}</dd></div>
              {budget.unbudgetedSpent > 0 && (
                <div className="flex justify-between"><dt className="text-ink-2">Spent outside the budget</dt><dd className="tabular font-medium text-amber-700">{money(budget.unbudgetedSpent)}</dd></div>
              )}
            </dl>
          </Card>

          <Card className="lg:col-span-2">
            <CardTitle>Categories</CardTitle>
            <ul className="divide-y divide-line">
              {budget.categories.map((c) => (
                <li key={c.id} className="flex items-center gap-3.5 py-3.5">
                  <CategoryIcon icon={c.icon} color={c.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {c.name}
                        {c.isFixed && <Badge>Fixed</Badge>}
                        {c.remaining < 0 ? <Badge tone="bad">Over by {money(-c.remaining)}</Badge> : c.percentUsed >= 80 && !c.isFixed ? <Badge tone="warn">{c.percentUsed}%</Badge> : null}
                      </p>
                      <p className="tabular text-sm text-ink-3"><span className="font-medium text-ink">{money(c.spent)}</span> of {money(c.limit)}</p>
                    </div>
                    <Progress className="mt-2" percent={c.percentUsed} color={c.isFixed && c.remaining >= 0 ? '#64748b' : undefined} />
                    <p className="mt-1 text-xs text-ink-3">{c.remaining >= 0 ? `${money(c.remaining)} remaining` : 'Limit exceeded'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
