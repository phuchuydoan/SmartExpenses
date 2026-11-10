// All arithmetic on money is done in integer cents so that sums are exact.
// The database stores DECIMAL(12,2); the API exposes plain numbers (6.5).

export function toCents(value) {
  if (value === null || value === undefined) return 0;
  // Prisma Decimal, string or number -> string with fixed 2 decimals
  const str = typeof value === 'number' ? value.toFixed(2) : value.toString();
  const negative = str.trim().startsWith('-');
  const [whole, frac = ''] = str.replace('-', '').trim().split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents) {
  return Math.round(cents) / 100;
}

/** Decimal string for writing to the database, e.g. 650 -> "6.50". */
export function centsToDecimal(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Integer percentage (rounded down) of spent against limit. */
export function percentOf(partCents, totalCents) {
  if (totalCents <= 0) return partCents > 0 ? 100 : 0;
  return Math.floor((partCents * 100) / totalCents);
}

/**
 * Split `totalCents` across weights so the parts add up exactly to the total.
 * The rounding remainder goes to the largest share.
 */
export function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalCents <= 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((totalCents * w) / sum));
  const remainder = totalCents - parts.reduce((a, b) => a + b, 0);
  const largest = weights.indexOf(Math.max(...weights));
  parts[largest] += remainder;
  return parts;
}

export function formatMoney(cents, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
