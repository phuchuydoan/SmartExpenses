import { z } from 'zod';
import { isIsoDate, isMonth } from './dates.js';

// Positive money amount with at most 2 decimals.
export const money = z
  .number({ invalid_type_error: 'Amount must be a number' })
  .positive('Amount must be greater than 0')
  .max(9_999_999_999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Amount can have at most 2 decimals');

export const moneyOrZero = z
  .number()
  .min(0)
  .max(9_999_999_999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Amount can have at most 2 decimals');

export const isoDate = z.string().refine(isIsoDate, 'Date must be YYYY-MM-DD');
export const month = z.string().refine(isMonth, 'Month must be YYYY-MM');
export const id = z.coerce.number().int().positive();
