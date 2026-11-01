/** Local calendar day key (YYYY-MM-DD) of an instant in a time zone. */
const dayKey = (date: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Consecutive local calendar days with at least one view, ending today (or yesterday when nothing
 * is seen today yet). Reference implementation for the SQL `learning_streak` RPC.
 */
export function computeStreak(seenAt: string[], today: Date, tz: string): number {
  const days = new Set(seenAt.map((s) => dayKey(new Date(s), tz)));
  const todayKey = dayKey(today, tz);
  let cursor = days.has(todayKey) ? todayKey : shiftDay(todayKey, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
