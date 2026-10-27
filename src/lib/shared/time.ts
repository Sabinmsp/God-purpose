/**
 * Calendar helpers pinned to Australia/Darwin (UTC+09:30, no daylight saving).
 * Dates are passed around as 'YYYY-MM-DD' strings so they never drift with
 * the host's timezone (Vercel functions run in UTC).
 */
export const APP_TIMEZONE = "Australia/Darwin";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export function localDate(now: Date = new Date()): string {
  return dateFmt.format(now);
}

export interface LocalClock {
  date: string;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Fractional hour, e.g. 18.5 for 6:30pm. */
  hourFloat: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localClock(now: Date = new Date()): LocalClock {
  const parts = Object.fromEntries(partsFmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    date: localDate(now),
    hour,
    minute,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hourFloat: hour + minute / 60,
  };
}

function toUtcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

export function weekdayOf(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const offset = (weekdayOf(date) + 6) % 7;
  return addDays(date, -offset);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return fromUtcDate(toUtcDate(date)) === date;
}

export function formatLongDate(date: string): string {
  return toUtcDate(date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(date: string): string {
  return toUtcDate(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}
