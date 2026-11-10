import { useEffect } from 'react';
import { LoaderCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cx, formatMonth, shiftMonth } from '../lib/format.js';

export function Card({ className, children, ...rest }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-white p-5 shadow-card', className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ children, action, hint }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">{children}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-night-2 disabled:bg-ink/40',
  brand: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/40',
  secondary: 'border border-line bg-white text-ink hover:bg-canvas disabled:text-ink-3',
  ghost: 'text-ink-2 hover:bg-canvas disabled:text-ink-3',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/40',
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, icon: Icon, ...rest }) {
  return (
    <button
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: Icon, className, ...rest }) {
  return (
    <button aria-label={label} title={label} className={cx('grid size-9 shrink-0 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-canvas', className)} {...rest}>
      <Icon className="size-[18px]" />
    </button>
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

const control = 'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-3/70 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';

export const Input = ({ className, ...rest }) => <input className={cx(control, className)} {...rest} />;
export const Select = ({ className, children, ...rest }) => (
  <select className={cx(control, 'appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
    {children}
  </select>
);

/** Money input with a currency prefix. Value is kept as a string while typing. */
export function MoneyInput({ value, onChange, symbol = '$', className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">{symbol}</span>
      <input
        inputMode="decimal"
        className={cx(control, 'tabular pl-7')}
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(',', '.');
          if (/^\d{0,10}(\.\d{0,2})?$/.test(next)) onChange(next);
        }}
        placeholder="0.00"
        {...rest}
      />
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative flex max-h-[92dvh] w-full animate-rise flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <header className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </header>
        <div className="overflow-y-auto px-5 pb-5 pt-2">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

/** Budget meter. Colour reflects state: on track / close / over. */
export function Progress({ percent, color, className, height = 'h-2' }) {
  const p = Math.max(0, percent);
  const tone = color ?? (p > 100 ? '#dc2626' : p >= 80 ? '#d97706' : '#059669');
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-ink/[0.07]', height, className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, p)}%`, backgroundColor: tone }} />
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-canvas text-ink-2',
    good: 'bg-brand-50 text-brand-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-700',
    info: 'bg-sky-50 text-sky-700',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }) {
  return (
    <div className={cx('grid place-items-center py-16 text-ink-3', className)}>
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Card className="text-center">
      <p className="font-medium">We couldn't load this page</p>
      <p className="mt-1 text-sm text-ink-3">{error?.message}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon className="size-6" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function MonthPicker({ month, onChange, max }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-white">
      <IconButton label="Previous month" icon={ChevronLeft} onClick={() => onChange(shiftMonth(month, -1))} />
      <span className="min-w-[8.5rem] text-center text-sm font-medium">{formatMonth(month)}</span>
      <IconButton label="Next month" icon={ChevronRight} disabled={max && month >= max} className="disabled:opacity-30" onClick={() => onChange(shiftMonth(month, 1))} />
    </div>
  );
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('inline-flex rounded-xl bg-ink/[0.06] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-ink/20')}>
      <span className={cx('absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}
