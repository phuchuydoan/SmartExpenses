// Calendar-date helpers. A "date" is the user's local day as "YYYY-MM-DD".
// DATE columns are read/written as UTC-midnight Date objects, so a calendar
// date never shifts when the server or the user changes timezone.

const pad = (n) => String(n).padStart(2, '0');

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone = 'UTC', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: isValidTimezone(timezone) ? timezone : 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const toDate = (iso) => new Date(`${iso}T00:00:00.000Z`);
export const toIso = (date) => date.toISOString().slice(0, 10);
export const monthOf = (iso) => iso.slice(0, 7);

export function addDays(iso, days) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** { start, end } ISO dates; end is exclusive (first day of next month). */
export function monthRange(month) {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

export const daysBetween = (fromIso, toIsoDate) =>
  Math.round((toDate(toIsoDate) - toDate(fromIso)) / 86400000);

/** Monday of the week containing the date. */
export function weekStart(iso) {
  const day = toDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

/** Next occurrence of a recurring schedule, keeping month-end days sane. */
export function nextOccurrence(iso, frequency) {
  if (frequency === 'weekly') return addDays(iso, 7);
  if (frequency === 'biweekly') return addDays(iso, 14);
  const [y, m, d] = iso.split('-').map(Number);
  const step = frequency === 'yearly' ? 12 : 1;
  const target = new Date(Date.UTC(y, m - 1 + step, 1));
  const month = `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}`;
  return `${month}-${pad(Math.min(d, daysInMonth(month)))}`;
}

export const isIsoDate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime()) && toIso(toDate(s)) === s;

export const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
