import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi, useToast, useAlertToasts } from '../lib/hooks.jsx';
import { Button, Field, Input, Modal, MoneyInput, Segmented, Select } from './ui.jsx';

const METHODS = ['Cash', 'Debit Card', 'Credit Card', 'Bank transfer', 'E-wallet'];
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Add / edit an income or expense. `transaction` is null when adding. */
export function TransactionForm({ open, onClose, onSaved, transaction, today }) {
  const toast = useToast();
  const showAlerts = useAlertToasts();
  const { data: cats } = useApi(open ? '/categories' : null);
  const { data: accts } = useApi(open ? '/accounts' : null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      transaction
        ? {
            type: transaction.type,
            amount: transaction.amount.toFixed(2),
            date: transaction.date,
            description: transaction.description ?? '',
            categoryId: transaction.categoryId ?? '',
            accountId: transaction.accountId,
            paymentMethod: transaction.paymentMethod ?? '',
          }
        : { type: 'expense', amount: '', date: today ?? localToday(), description: '', categoryId: '', accountId: '', paymentMethod: '' },
    );
  }, [open, transaction, today]);

  const accounts = accts?.accounts ?? [];
  const categories = (cats?.categories ?? []).filter((c) => c.kind === form?.type);

  // Sensible defaults once the lists arrive.
  useEffect(() => {
    if (!form || !accounts.length) return;
    if (!form.accountId) setForm((f) => ({ ...f, accountId: accounts[0].id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, form?.accountId]);

  if (!form) return null;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  async function submit(e) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError('Enter an amount greater than 0');
    if (!form.categoryId) return setError('Choose a category');
    setSaving(true);
    setError('');
    try {
      const body = {
        type: form.type,
        amount,
        date: form.date,
        description: form.description,
        categoryId: Number(form.categoryId),
        accountId: Number(form.accountId),
        paymentMethod: form.paymentMethod || null,
      };
      const result = transaction
        ? await api(`/transactions/${transaction.id}`, { method: 'PUT', body })
        : await api('/transactions', { method: 'POST', body });
      toast(transaction ? 'Transaction updated' : form.type === 'income' ? 'Income added' : 'Expense added');
      showAlerts(result.alerts);
      onSaved?.(result.transaction);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={transaction ? 'Edit transaction' : 'Add transaction'}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          className="flex w-full"
          value={form.type}
          onChange={(type) => setForm((f) => ({ ...f, type, categoryId: '' }))}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        />
        <Field label="Amount">
          <MoneyInput value={form.amount} onChange={set('amount')} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={form.categoryId} onChange={set('categoryId')} required>
              <option value="" disabled>Choose...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={set('date')} required />
          </Field>
        </div>
        <Field label="Description">
          <Input value={form.description} onChange={set('description')} maxLength={255} placeholder={form.type === 'expense' ? 'e.g. Starbucks coffee' : 'e.g. Part-time job'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account">
            <Select value={form.accountId} onChange={set('accountId')} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Payment method">
            <Select value={form.paymentMethod} onChange={set('paymentMethod')}>
              <option value="">Not set</option>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="brand" loading={saving}>{transaction ? 'Save changes' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}
