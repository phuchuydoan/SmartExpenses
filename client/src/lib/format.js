let currency = 'USD';
export const setCurrency = (code) => (currency = code || 'USD');
export const getCurrency = () => currency;

export function money(value, { cents = true, sign = false } = {}) {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
      signDisplay: sign ? 'exceptZero' : 'auto',
    }).format(n);
  } catch {
    return `${n.toFixed(cents ? 2 : 0)} ${currency}`;
  }
}

/** Compact amounts for chart axes: $1.2k */
export const moneyShort = (value) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
  } catch {
    return String(value);
  }
};

// Calendar dates are plain "YYYY-MM-DD" strings; parse them as local days.
const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const formatDate = (iso, opts = { month: 'short', day: 'numeric' }) => parse(iso).toLocaleDateString('en-US', opts);
export const formatLongDate = (iso) => formatDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });
export const formatMonth = (month, opts = { month: 'long', year: 'numeric' }) => parse(`${month}-01`).toLocaleDateString('en-US', opts);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function timeAgo(dateString) {
  const seconds = Math.max(0, (Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
