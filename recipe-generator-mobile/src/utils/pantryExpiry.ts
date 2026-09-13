/**
 * Expiry maths for the pantry (BACKLOG 7.4). Its own file, not the screen's, because it is
 * date arithmetic across local midnight — the one part of the Pantry screen that can be
 * wrong without looking wrong. See `pantryExpiry.check.ts`.
 */

/** Anything due within this many days is what the user should cook next. */
export const USE_FIRST_DAYS = 3;

/**
 * Whole days from today to `iso` (YYYY-MM-DD): 0 is today, negative is already expired.
 *
 * Both sides are pinned to local midnight before subtracting — an item due tomorrow must
 * read as 1 day at 23:00 as well as at 08:00, which a raw now-to-midnight difference gets
 * wrong. `T00:00:00` with no zone is deliberate: it parses as local time, matching a date
 * the user typed in their own calendar.
 */
export const daysUntil = (iso: string, today: Date = new Date()): number => {
  const from = new Date(today);
  from.setHours(0, 0, 0, 0);
  const due = new Date(`${iso}T00:00:00`);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - from.getTime()) / 86400000);
};

/** How a days-remaining count reads on a badge. */
export const expiryLabel = (days: number): string =>
  days < 0 ? 'expired' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days`;
