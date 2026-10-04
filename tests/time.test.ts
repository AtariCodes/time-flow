import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatClock,
  formatDuration,
  isDateKey,
  parseClock,
  snap,
  startOfWeek,
  weekdayIndex,
} from '../src/lib/time';

describe('time', () => {
  it('formats clock times including midnight', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(510)).toBe('08:30');
    expect(formatClock(1440)).toBe('24:00');
    expect(formatClock(1500)).toBe('01:00');
  });

  it('parses clock times', () => {
    expect(parseClock('8:30')).toBe(510);
    expect(parseClock('24:00')).toBe(1440);
    expect(parseClock('24:30')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(95)).toBe('1 h 35 min');
  });

  it('handles date arithmetic across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('computes Monday-based weeks', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // pondělí
    expect(weekdayIndex('2026-10-04')).toBe(6); // neděle
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
  });

  it('validates date keys', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-2-1')).toBe(false);
  });

  it('snaps to steps', () => {
    expect(snap(52, 15)).toBe(45);
    expect(snap(53, 15)).toBe(60);
    expect(snap(53, 1)).toBe(53);
  });
});
