/** Minuty v jednom (nominálním) dni. Dny se změnou letního času počítáme také jako 24 h. */
export const DAY_MINUTES = 1440;

/** Klíč dne ve formátu YYYY-MM-DD (místní čas). */
export type DateKey = string;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const d = parseDateKey(value);
  return toDateKey(d) === value;
}

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Den v týdnu, 0 = pondělí … 6 = neděle. */
export function weekdayIndex(key: DateKey): number {
  return (parseDateKey(key).getDay() + 6) % 7;
}

/** Pondělí týdne, do kterého den patří. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function startOfMonth(key: DateKey): DateKey {
  return key.slice(0, 8) + '01';
}

export function daysInMonth(key: DateKey): number {
  const d = parseDateKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function rangeDays(start: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** 0 → "00:00", 1440 → "24:00", 1500 → "01:00" (+1 den se řeší jinde). */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const display = minutes === DAY_MINUTES ? DAY_MINUTES : m;
  const h = Math.floor(display / 60);
  return `${String(h).padStart(2, '0')}:${String(display % 60).padStart(2, '0')}`;
}

/** Délka: 90 → "1 h 30 min", 45 → "45 min", 120 → "2 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Kompaktní délka pro malé štítky: "1h30", "45m". */
export function formatDurationShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** "08:30" → 510; neplatný vstup → null. Akceptuje i "8:30" a "24:00". */
export function parseClock(value: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59) return null;
  if (h === 24 && m === 0) return DAY_MINUTES;
  if (h > 23) return null;
  return h * 60 + m;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snap(minutes: number, step: number): number {
  if (step <= 1) return Math.round(minutes);
  return Math.round(minutes / step) * step;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

const longFormatter = new Intl.DateTimeFormat('cs-CZ', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortFormatter = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' });

export function formatDateLong(key: DateKey): string {
  return longFormatter.format(parseDateKey(key));
}

export function formatDateShort(key: DateKey): string {
  return shortFormatter.format(parseDateKey(key));
}

export function formatMonth(key: DateKey): string {
  const s = monthFormatter.format(parseDateKey(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const WEEKDAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
