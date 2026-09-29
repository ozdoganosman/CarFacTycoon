// The game clock runs in weeks since 1 January 1900 (52 weeks per year).
import { isTurkish } from '../i18n';
import { fmtMonthYear, fmtShortMonth } from '../i18n/format';

export const START_YEAR = 1900;
export const WEEKS_PER_YEAR = 52;

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const yearOf = (week: number) => START_YEAR + Math.floor(week / WEEKS_PER_YEAR);
/** Fractional year, e.g. 1929.8 for late October 1929. */
export const yearFloat = (week: number) => START_YEAR + week / WEEKS_PER_YEAR;
export const weekOfYear = (week: number) => week % WEEKS_PER_YEAR;
export const monthOf = (week: number) => Math.min(11, Math.floor((weekOfYear(week) / WEEKS_PER_YEAR) * 12));
export const weekFor = (year: number, month = 0) => (year - START_YEAR) * WEEKS_PER_YEAR + Math.round((month / 12) * WEEKS_PER_YEAR);

export function formatDate(week: number): string {
  if (!isTurkish()) return fmtMonthYear(monthOf(week), yearOf(week));
  return `${MONTHS[monthOf(week)]} ${yearOf(week)}`;
}

/** True on the first week of each month. */
export function isMonthStart(week: number): boolean {
  return week === 0 || monthOf(week) !== monthOf(week - 1);
}

/** Short label for chart axes, e.g. "Mar '08". */
export function formatShort(week: number): string {
  if (!isTurkish()) return fmtShortMonth(monthOf(week), yearOf(week));
  return `${MONTHS[monthOf(week)].slice(0, 3)} '${String(yearOf(week)).slice(2)}`;
}
