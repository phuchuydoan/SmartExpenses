import { PiggyBank } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon.jsx';
import { cx, formatDate, money } from '../lib/format.js';

export function TransactionRow({ t, onClick, showDate = true }) {
  const isIncome = t.type === 'income';
  const isSavings = t.type === 'savings';
  const title = t.description || t.category?.name || (isSavings ? 'Savings' : 'Transaction');
  const meta = [isSavings ? t.goal?.name ?? 'Savings goal' : t.category?.name ?? 'Uncategorised', t.paymentMethod, showDate ? formatDate(t.date) : null].filter(Boolean);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex w-full items-center gap-3 px-1 py-2.5 text-left', onClick && 'rounded-xl transition-colors hover:bg-canvas')}>
      {isSavings ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><PiggyBank className="size-5" /></span>
      ) : (
        <CategoryIcon icon={t.category?.icon} color={t.category?.color} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-ink-3">{meta.join(' · ')}</p>
      </div>
      <span className={cx('tabular shrink-0 text-sm font-semibold', isIncome ? 'text-brand-700' : 'text-ink')}>
        {isIncome ? '+' : '-'}{money(t.amount)}
      </span>
    </Tag>
  );
}
