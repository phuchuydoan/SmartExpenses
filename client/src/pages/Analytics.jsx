import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp, ChartColumn } from 'lucide-react';
import { useApi } from '../lib/hooks.jsx';
import { cx, formatDate, formatMonth, money, moneyShort } from '../lib/format.js';
import { Card, CardTitle, Empty, ErrorState, MonthPicker, PageHeader, Spinner } from '../components/ui.jsx';

// Chart roles. Series colours come from a colour-blind-checked palette;
// text always uses ink colours, never the series colour.
const C = { expense: '#2a78d6', income: '#1baf7a', savings: '#eda100', reference: '#94a3b8', grid: '#e6e9ee', axis: '#64748b' };
const axis = { tick: { fill: C.axis, fontSize: 12 }, axisLine: false, tickLine: false };

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function ChartTooltip({ active, payload, label, title }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{title ? title(label, payload) : label}</p>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>
          <span className="tabular font-medium text-ink">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Tile({ label, value, note, tone }) {
  return (
    <Card className="!p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="tabular mt-1 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className={cx('mt-1 flex items-center gap-1 text-xs', tone ?? 'text-ink-3')}>{note}</p>}
    </Card>
  );
}

function Change({ percent }) {
  if (percent === null) return <span className="text-ink-3">New</span>;
  if (percent === 0) return <span className="text-ink-3">No change</span>;
  const up = percent > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  // More spending is the "bad" direction; the arrow and sign carry the meaning too.
  return (
    <span className={cx('inline-flex items-center gap-1 font-medium', up ? 'text-red-600' : 'text-brand-700')}>
      <Icon className="size-3.5" />{up ? '+' : ''}{percent}%
    </span>
  );
}

export default function Analytics() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, loading, reload } = useApi('/analytics', { month });

  const header = (
    <PageHeader title="Analytics" subtitle="See your habits, not just your transactions.">
      <MonthPicker month={month} onChange={setMonth} max={thisMonth()} />
    </PageHeader>
  );
  if (loading && !data) return <div>{header}<Spinner /></div>;
  if (error && !data) return <div>{header}<ErrorState error={error} onRetry={reload} /></div>;

  const { summary: s, daily, weekly, monthly, categories, comparison } = data;
  const hasData = monthly.some((m) => m.income || m.expense);
  if (!hasData) {
    return <div>{header}<Card><Empty icon={ChartColumn} title="No data to chart yet">Add a few transactions and your reports will appear here.</Empty></Card></div>;
  }

  // Compare with the same number of days last month while the month is running.
  const base = s.previousSamePoint ?? s.previousExpense;
  const vsLast = base > 0 ? Math.round(((s.expense - base) / base) * 100) : null;
  const hasPace = daily.some((d) => d.budgetPace !== null);
  const top = categories.slice(0, 7);
  const rest = categories.slice(7);
  const bars = rest.length ? [...top, { name: `Other (${rest.length})`, color: C.reference, amount: rest.reduce((sum, c) => sum + c.amount, 0), percent: Math.round(rest.reduce((sum, c) => sum + c.percent, 0) * 10) / 10 }] : top;
  const maxBar = Math.max(...bars.map((b) => b.amount), 1);

  return (
    <div className="animate-rise">
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Spent"
          value={money(s.expense)}
          tone={vsLast === null ? undefined : vsLast > 0 ? 'text-red-600' : 'text-brand-700'}
          note={vsLast === null ? 'No data for last month' : <>{vsLast > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{vsLast > 0 ? '+' : ''}{vsLast}% vs {s.previousSamePoint !== null ? 'same point last month' : 'last month'}</>}
        />
        <Tile label="Income" value={money(s.income)} note={`Net ${money(s.net, { sign: true })}`} />
        <Tile label="Saved" value={money(s.savings)} note={`${s.savingsRate}% of income`} />
        <Tile label="Average per day" value={money(s.averageDaily)} note={s.topCategory ? `Top category: ${s.topCategory}` : undefined} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle hint={hasPace ? 'Running total compared with spending your budget evenly through the month.' : 'Running total for the month.'}>Spending over the month</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" {...axis} interval={4} />
                <YAxis {...axis} width={52} tickFormatter={moneyShort} />
                <Tooltip content={<ChartTooltip title={(day) => formatDate(daily[day - 1].date)} />} cursor={{ stroke: C.reference, strokeDasharray: '3 3' }} />
                {hasPace && <Legend verticalAlign="top" align="right" height={28} iconType="plainline" formatter={(v) => <span className="text-xs text-ink-2">{v}</span>} />}
                {hasPace && <Line name="Even budget pace" dataKey="budgetPace" stroke={C.reference} strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />}
                <Line name="Spent so far" dataKey="cumulative" stroke={C.expense} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle hint={`Share of ${formatMonth(month, { month: 'long' })} spending`}>Category breakdown</CardTitle>
          {bars.length ? (
            <ul className="space-y-3.5">
              {bars.map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} /><span className="truncate font-medium">{c.name}</span></span>
                    <span className="tabular shrink-0 text-ink-2"><span className="font-medium text-ink">{money(c.amount)}</span> · {c.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (c.amount / maxBar) * 100)}%`, backgroundColor: c.color }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No expenses recorded this month.</p>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Last 6 months">Income vs expenses</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" {...axis} tickFormatter={(m) => formatMonth(m, { month: 'short' })} />
                <YAxis {...axis} width={52} tickFormatter={moneyShort} />
                <Tooltip content={<ChartTooltip title={(m) => formatMonth(m)} />} cursor={{ fill: 'rgb(11 18 32 / 0.04)' }} />
                <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-ink-2">{v}</span>} />
                <Bar name="Income" dataKey="income" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar name="Expenses" dataKey="expense" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar name="Saved" dataKey="savings" fill={C.savings} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle hint="Last 8 weeks, Monday to Sunday">Weekly spending</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="weekStart" {...axis} tickFormatter={(d) => formatDate(d)} />
                <YAxis {...axis} width={52} tickFormatter={moneyShort} />
                <Tooltip content={<ChartTooltip title={(d) => `Week of ${formatDate(d)}`} />} cursor={{ fill: 'rgb(11 18 32 / 0.04)' }} />
                <Bar name="Spent" dataKey="expense" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle hint={formatMonth(month)}>Daily spending</CardTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" {...axis} interval={4} />
                <YAxis {...axis} width={52} tickFormatter={moneyShort} />
                <Tooltip content={<ChartTooltip title={(day) => formatDate(daily[day - 1].date)} />} cursor={{ fill: 'rgb(11 18 32 / 0.04)' }} />
                <Bar name="Spent" dataKey="expense" fill={C.expense} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle hint="Full month totals">This month vs last month</CardTitle>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="px-1 pb-2 font-medium">Category</th>
                  <th className="px-1 pb-2 text-right font-medium">This</th>
                  <th className="px-1 pb-2 text-right font-medium">Last</th>
                  <th className="px-1 pb-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {comparison.map((c) => (
                  <tr key={c.categoryId ?? 'none'}>
                    <td className="max-w-[9rem] truncate px-1 py-2 font-medium">{c.name}</td>
                    <td className="tabular px-1 py-2 text-right">{money(c.current, { cents: false })}</td>
                    <td className="tabular px-1 py-2 text-right text-ink-3">{money(c.previous, { cents: false })}</td>
                    <td className="tabular px-1 py-2 text-right text-xs"><Change percent={c.changePercent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
