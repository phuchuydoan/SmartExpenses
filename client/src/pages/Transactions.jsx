import { useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Trash2, Receipt, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useApi, useToast } from '../lib/hooks.jsx';
import { formatDate, money, shiftMonth } from '../lib/format.js';
import { Button, Card, Empty, ErrorState, IconButton, Input, Modal, MonthPicker, PageHeader, Select, Spinner } from '../components/ui.jsx';
import { TransactionRow } from '../components/TransactionRow.jsx';
import { TransactionForm } from '../components/TransactionForm.jsx';
import { notifyChanged } from '../components/Notifications.jsx';

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function Transactions() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [filters, setFilters] = useState({ type: '', categoryId: '', q: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // transaction | 'new' | null
  const [deleting, setDeleting] = useState(null);
  const { data: cats } = useApi('/categories');

  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, q: search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => ({ month, ...filters, page, pageSize: 30 }), [month, filters, page]);
  const { data, error, loading, reload } = useApi('/transactions', query);

  const setFilter = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };

  // Group the page of results by day.
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of data?.items ?? []) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    return [...map.entries()];
  }, [data]);

  async function remove() {
    try {
      await api(`/transactions/${deleting.id}`, { method: 'DELETE' });
      toast('Transaction deleted');
      setDeleting(null);
      notifyChanged();
      reload();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="animate-rise">
      <PageHeader title="Transactions" subtitle="Every income and expense, in one place.">
        <MonthPicker month={month} onChange={(m) => { setMonth(m); setPage(1); }} max={shiftMonth(thisMonth(), 1)} />
        <Button variant="brand" icon={Plus} onClick={() => setEditing('new')}>Add</Button>
      </PageHeader>

      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[['Income', data.totals.income, 'text-brand-700'], ['Expenses', data.totals.expense, 'text-ink'], ['Saved', data.totals.savings, 'text-sky-700']].map(([label, value, tone]) => (
            <Card key={label} className="!p-4">
              <p className="text-xs text-ink-3">{label}</p>
              <p className={`tabular mt-0.5 text-lg font-semibold ${tone}`}>{money(value)}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="!p-0">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_10rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-ink-3" />
            <Input className="pl-9" placeholder="Search descriptions..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search transactions" />
          </div>
          <Select value={filters.type} onChange={setFilter('type')} aria-label="Type">
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="savings">Savings</option>
          </Select>
          <Select value={filters.categoryId} onChange={setFilter('categoryId')} aria-label="Category">
            <option value="">All categories</option>
            {(cats?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>
        ) : groups.length === 0 ? (
          <Empty icon={Receipt} title="Nothing here" action={<Button variant="secondary" onClick={() => setEditing('new')}>Add a transaction</Button>}>
            No transactions match this month and these filters.
          </Empty>
        ) : (
          <div className="px-4 pb-2">
            {groups.map(([date, items]) => (
              <div key={date}>
                <p className="sticky top-[61px] z-10 -mx-4 bg-white/95 px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-3 backdrop-blur">
                  {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <ul>
                  {items.map((t) => (
                    <li key={t.id} className="group flex items-center gap-1">
                      <div className="min-w-0 flex-1"><TransactionRow t={t} showDate={false} /></div>
                      {t.type !== 'savings' && <IconButton label="Edit" icon={Pencil} onClick={() => setEditing(t)} />}
                      <IconButton label="Delete" icon={Trash2} className="hover:!bg-red-50 hover:text-red-600" onClick={() => setDeleting(t)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {data && pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-ink-3">Page {page} of {pages} · {data.total} transactions</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <TransactionForm
        open={Boolean(editing)}
        transaction={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { notifyChanged(); reload(); }}
      />
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete transaction?"
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}
      >
        {deleting && (
          <p className="text-sm text-ink-2">
            <span className="font-medium text-ink">{deleting.description || deleting.category?.name || 'This transaction'}</span> ({money(deleting.amount)}, {formatDate(deleting.date)}) will be removed and your budget and balance will be recalculated.
          </p>
        )}
      </Modal>
    </div>
  );
}
