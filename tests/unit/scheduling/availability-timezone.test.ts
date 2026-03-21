/**
 * Tests for Provider Weekly Availability timezone handling.
 *
 * Covers the date-shift bug where saving a Friday override stored it on Thursday
 * (caused by double UTC→ET→UTC conversion), DST edge cases, and date iteration
 * in the weekly schedule builder.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dbDate,
  parseDateET,
  toDateStringET,
  todayET,
  dbDateToString,
  EASTERN_TZ,
  getDatePartsInTz,
  midnightInTz,
  addCalendarDaysET,
  startOfDayET,
  endOfDayET,
} from '@/lib/utils/timezone';

// ---------------------------------------------------------------------------
// 1. Core timezone utility correctness
// ---------------------------------------------------------------------------

describe('timezone utilities', () => {
  describe('dbDate', () => {
    it('returns UTC midnight for a given date string', () => {
      const d = dbDate('2026-03-27');
      expect(d.toISOString()).toBe('2026-03-27T00:00:00.000Z');
    });

    it('handles month and year boundaries', () => {
      expect(dbDate('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(dbDate('2025-12-31').toISOString()).toBe('2025-12-31T00:00:00.000Z');
      expect(dbDate('2026-02-28').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('handles leap day', () => {
      expect(dbDate('2028-02-29').toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });
  });

  describe('parseDateET', () => {
    it('returns a Date representing midnight Eastern for the given date', () => {
      const d = parseDateET('2026-03-27');
      // March 27 EDT (UTC-4): midnight ET = 04:00 UTC
      expect(d.getTime()).toBeGreaterThan(dbDate('2026-03-27').getTime());
      // Verify when formatted in ET it shows March 27
      expect(toDateStringET(d)).toBe('2026-03-27');
    });

    it('returns correct ET date during EST (winter)', () => {
      // January is EST (UTC-5)
      const d = parseDateET('2026-01-15');
      expect(toDateStringET(d)).toBe('2026-01-15');
      // midnight ET in EST = 05:00 UTC
      expect(d.toISOString()).toBe('2026-01-15T05:00:00.000Z');
    });

    it('returns correct ET date during EDT (summer)', () => {
      // July is EDT (UTC-4)
      const d = parseDateET('2026-07-04');
      expect(toDateStringET(d)).toBe('2026-07-04');
      // midnight ET in EDT = 04:00 UTC
      expect(d.toISOString()).toBe('2026-07-04T04:00:00.000Z');
    });
  });

  describe('toDateStringET', () => {
    it('converts an Eastern-midnight Date back to the correct date string', () => {
      expect(toDateStringET(parseDateET('2026-03-27'))).toBe('2026-03-27');
      expect(toDateStringET(parseDateET('2026-12-31'))).toBe('2026-12-31');
      expect(toDateStringET(parseDateET('2026-01-01'))).toBe('2026-01-01');
    });

    it('converts a UTC-midnight Date to the PREVIOUS day (this is expected)', () => {
      // This documents the known behavior: UTC midnight is "yesterday" in ET
      const utcMidnight = dbDate('2026-03-27'); // 2026-03-27T00:00:00Z
      const etDateStr = toDateStringET(utcMidnight);
      // UTC midnight → 8pm EDT previous day (or 7pm EST)
      expect(etDateStr).toBe('2026-03-26');
    });
  });

  describe('dbDateToString', () => {
    it('extracts YYYY-MM-DD from UTC midnight dates', () => {
      expect(dbDateToString(new Date('2026-03-27T00:00:00.000Z'))).toBe('2026-03-27');
      expect(dbDateToString(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    });
  });

  describe('getDatePartsInTz', () => {
    it('returns correct day-of-week for known dates', () => {
      // March 21, 2026 is a Saturday
      vi.setSystemTime(new Date('2026-03-21T15:00:00.000Z'));
      const parts = getDatePartsInTz(EASTERN_TZ);
      expect(parts.dayOfWeek).toBe(6); // Saturday
      expect(parts.day).toBe(21);
      expect(parts.month).toBe(2); // 0-indexed: March = 2
      expect(parts.year).toBe(2026);
    });

    it('returns correct date when UTC is next day but ET is still previous', () => {
      // 2026-03-28 at 03:00 UTC = 2026-03-27 at 11pm EDT
      vi.setSystemTime(new Date('2026-03-28T03:00:00.000Z'));
      const parts = getDatePartsInTz(EASTERN_TZ);
      expect(parts.day).toBe(27);
      expect(parts.dayOfWeek).toBe(5); // Friday
    });
  });
});

// ---------------------------------------------------------------------------
// 2. The date-shift bug: dbDate vs parseDateET in override saving
// ---------------------------------------------------------------------------

describe('date-shift bug (double conversion)', () => {
  it('dbDate + toDateStringET shifts the date back by one day', () => {
    // This is the bug that was reported: the old code path
    const dateStr = '2026-03-27'; // Friday
    const utcMidnight = dbDate(dateStr);
    const reInterpreted = toDateStringET(utcMidnight);
    // BUG: March 27 UTC midnight → March 26 in Eastern
    expect(reInterpreted).toBe('2026-03-26');
    expect(reInterpreted).not.toBe(dateStr);
  });

  it('parseDateET + toDateStringET preserves the date correctly', () => {
    // This is the fixed code path
    const dateStr = '2026-03-27'; // Friday
    const etMidnight = parseDateET(dateStr);
    const roundTripped = toDateStringET(etMidnight);
    expect(roundTripped).toBe('2026-03-27');
    expect(roundTripped).toBe(dateStr);
  });

  it('the fix works for every day of the week', () => {
    const testDates = [
      '2026-03-22', // Sunday
      '2026-03-23', // Monday
      '2026-03-24', // Tuesday
      '2026-03-25', // Wednesday
      '2026-03-26', // Thursday
      '2026-03-27', // Friday
      '2026-03-28', // Saturday
    ];
    for (const dateStr of testDates) {
      const etMidnight = parseDateET(dateStr);
      expect(toDateStringET(etMidnight)).toBe(dateStr);
    }
  });

  it('the fix works across month boundaries', () => {
    const dates = ['2026-02-28', '2026-03-01', '2026-03-31', '2026-04-01'];
    for (const dateStr of dates) {
      expect(toDateStringET(parseDateET(dateStr))).toBe(dateStr);
    }
  });

  it('the fix works across year boundaries', () => {
    expect(toDateStringET(parseDateET('2025-12-31'))).toBe('2025-12-31');
    expect(toDateStringET(parseDateET('2026-01-01'))).toBe('2026-01-01');
  });

  it('simulates full override save flow: date string → parseDateET → service → dbDate', () => {
    // Simulates the corrected flow in overrides/route.ts → setProviderDateOverrides
    const clientDateStr = '2026-03-27';

    // Step 1: API route converts with parseDateET (the fix)
    const dateForService = parseDateET(clientDateStr);

    // Step 2: Service does dbDate(toDateStringET(date))
    const dateOnly = dbDate(toDateStringET(dateForService));

    // Step 3: This should be March 27 UTC midnight
    expect(dateOnly.toISOString()).toBe('2026-03-27T00:00:00.000Z');
    expect(dbDateToString(dateOnly)).toBe('2026-03-27');
  });

  it('the OLD buggy flow would produce wrong date', () => {
    const clientDateStr = '2026-03-27';

    // Old code: API used dbDate (UTC midnight)
    const dateForService = dbDate(clientDateStr);

    // Service still does dbDate(toDateStringET(date))
    const dateOnly = dbDate(toDateStringET(dateForService));

    // BUG: stored as March 26 instead of March 27
    expect(dateOnly.toISOString()).toBe('2026-03-26T00:00:00.000Z');
    expect(dbDateToString(dateOnly)).not.toBe(clientDateStr);
  });
});

// ---------------------------------------------------------------------------
// 3. DST boundary edge cases
// ---------------------------------------------------------------------------

describe('DST transition edge cases', () => {
  // In 2026: Spring forward Mar 8, Fall back Nov 1

  it('parseDateET handles spring-forward date (Mar 8, 2026)', () => {
    const d = parseDateET('2026-03-08');
    expect(toDateStringET(d)).toBe('2026-03-08');
  });

  it('parseDateET handles day before spring-forward (Mar 7, 2026 — last EST day)', () => {
    const d = parseDateET('2026-03-07');
    expect(toDateStringET(d)).toBe('2026-03-07');
    // EST: midnight = 05:00 UTC
    expect(d.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  });

  it('parseDateET handles day after spring-forward (Mar 9, 2026 — first full EDT day)', () => {
    const d = parseDateET('2026-03-09');
    expect(toDateStringET(d)).toBe('2026-03-09');
    // EDT: midnight = 04:00 UTC
    expect(d.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('parseDateET handles fall-back date (Nov 1, 2026)', () => {
    const d = parseDateET('2026-11-01');
    expect(toDateStringET(d)).toBe('2026-11-01');
  });

  it('parseDateET handles day before fall-back (Oct 31, 2026 — last EDT day)', () => {
    const d = parseDateET('2026-10-31');
    expect(toDateStringET(d)).toBe('2026-10-31');
    // EDT: midnight = 04:00 UTC
    expect(d.toISOString()).toBe('2026-10-31T04:00:00.000Z');
  });

  it('parseDateET handles day after fall-back (Nov 2, 2026 — first full EST day)', () => {
    const d = parseDateET('2026-11-02');
    expect(toDateStringET(d)).toBe('2026-11-02');
    // EST: midnight = 05:00 UTC
    expect(d.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('override save flow works across DST spring-forward', () => {
    for (const dateStr of ['2026-03-07', '2026-03-08', '2026-03-09']) {
      const dateForService = parseDateET(dateStr);
      const dateOnly = dbDate(toDateStringET(dateForService));
      expect(dbDateToString(dateOnly)).toBe(dateStr);
    }
  });

  it('override save flow works across DST fall-back', () => {
    for (const dateStr of ['2026-10-31', '2026-11-01', '2026-11-02']) {
      const dateForService = parseDateET(dateStr);
      const dateOnly = dbDate(toDateStringET(dateForService));
      expect(dbDateToString(dateOnly)).toBe(dateStr);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Weekly schedule date iteration correctness
// ---------------------------------------------------------------------------

describe('weekly schedule date iteration', () => {
  /**
   * Simulates the date iteration logic from getProviderWeeklySchedule
   * to verify date strings and dayOfWeek values are correct.
   */
  function simulateWeeklyIteration(startStr: string, weeks: number) {
    const startParts = startStr.split('-').map(Number);
    const results: { dateStr: string; dayOfWeek: number }[] = [];
    const totalDays = weeks * 7;

    for (let i = 0; i < totalDays; i++) {
      const calDate = new Date(startParts[0], startParts[1] - 1, startParts[2] + i);
      const dateStr = `${calDate.getFullYear()}-${String(calDate.getMonth() + 1).padStart(2, '0')}-${String(calDate.getDate()).padStart(2, '0')}`;
      const cursorDate = parseDateET(dateStr);
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
        new Intl.DateTimeFormat('en-US', { timeZone: EASTERN_TZ, weekday: 'short' }).format(cursorDate)
      );
      results.push({ dateStr, dayOfWeek });
    }
    return results;
  }

  it('generates correct dates and day-of-week for a 4-week window starting Mar 15', () => {
    const results = simulateWeeklyIteration('2026-03-15', 4);
    expect(results).toHaveLength(28);

    // First day: Sunday Mar 15
    expect(results[0]).toEqual({ dateStr: '2026-03-15', dayOfWeek: 0 });
    // Monday Mar 16
    expect(results[1]).toEqual({ dateStr: '2026-03-16', dayOfWeek: 1 });
    // Friday Mar 27 (the date from the bug report)
    expect(results[12]).toEqual({ dateStr: '2026-03-27', dayOfWeek: 5 });
    // Saturday Mar 28
    expect(results[13]).toEqual({ dateStr: '2026-03-28', dayOfWeek: 6 });
    // Last day: Saturday Apr 11
    expect(results[27]).toEqual({ dateStr: '2026-04-11', dayOfWeek: 6 });
  });

  it('week boundaries align: every 7th day is a Sunday', () => {
    const results = simulateWeeklyIteration('2026-03-15', 4);
    for (let w = 0; w < 4; w++) {
      expect(results[w * 7].dayOfWeek).toBe(0); // Sunday
      expect(results[w * 7 + 6].dayOfWeek).toBe(6); // Saturday
    }
  });

  it('handles month rollover correctly (March → April)', () => {
    const results = simulateWeeklyIteration('2026-03-29', 1);
    expect(results[0]).toEqual({ dateStr: '2026-03-29', dayOfWeek: 0 });
    expect(results[3]).toEqual({ dateStr: '2026-04-01', dayOfWeek: 3 });
    expect(results[6]).toEqual({ dateStr: '2026-04-04', dayOfWeek: 6 });
  });

  it('handles year rollover correctly (Dec 2025 → Jan 2026)', () => {
    const results = simulateWeeklyIteration('2025-12-28', 1);
    expect(results[0]).toEqual({ dateStr: '2025-12-28', dayOfWeek: 0 });
    expect(results[4]).toEqual({ dateStr: '2026-01-01', dayOfWeek: 4 });
    expect(results[6]).toEqual({ dateStr: '2026-01-03', dayOfWeek: 6 });
  });

  it('handles DST spring-forward week (Mar 8, 2026)', () => {
    const results = simulateWeeklyIteration('2026-03-08', 1);
    expect(results).toHaveLength(7);
    // Mar 8 is a Sunday, DST springs forward this day
    expect(results[0]).toEqual({ dateStr: '2026-03-08', dayOfWeek: 0 });
    expect(results[6]).toEqual({ dateStr: '2026-03-14', dayOfWeek: 6 });
    // Every date is unique and sequential
    const dateStrs = results.map((r) => r.dateStr);
    expect(new Set(dateStrs).size).toBe(7);
  });

  it('handles DST fall-back week (Nov 1, 2026)', () => {
    const results = simulateWeeklyIteration('2026-11-01', 1);
    expect(results).toHaveLength(7);
    expect(results[0]).toEqual({ dateStr: '2026-11-01', dayOfWeek: 0 });
    expect(results[6]).toEqual({ dateStr: '2026-11-07', dayOfWeek: 6 });
  });

  it('each date string round-trips through parseDateET correctly', () => {
    const results = simulateWeeklyIteration('2026-03-15', 4);
    for (const { dateStr } of results) {
      expect(toDateStringET(parseDateET(dateStr))).toBe(dateStr);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Weekly route default startDate calculation
// ---------------------------------------------------------------------------

describe('weekly route default startDate calculation', () => {
  function computeDefaultStartDate(): string {
    const { year, month, day, dayOfWeek } = getDatePartsInTz(EASTERN_TZ);
    const sunday = new Date(Date.UTC(year, month, day - dayOfWeek));
    return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`;
  }

  it('computes Sunday for Saturday Mar 21, 2026', () => {
    vi.setSystemTime(new Date('2026-03-21T15:00:00.000Z'));
    expect(computeDefaultStartDate()).toBe('2026-03-15');
  });

  it('computes Sunday for Sunday Mar 22, 2026', () => {
    vi.setSystemTime(new Date('2026-03-22T15:00:00.000Z'));
    expect(computeDefaultStartDate()).toBe('2026-03-22');
  });

  it('computes Sunday for Monday Mar 23, 2026', () => {
    vi.setSystemTime(new Date('2026-03-23T15:00:00.000Z'));
    expect(computeDefaultStartDate()).toBe('2026-03-22');
  });

  it('computes Sunday for Friday Mar 27, 2026', () => {
    vi.setSystemTime(new Date('2026-03-27T15:00:00.000Z'));
    expect(computeDefaultStartDate()).toBe('2026-03-22');
  });

  it('handles early month date — Wednesday Apr 1, 2026', () => {
    vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
    // Apr 1 = Wednesday (dayOfWeek=3), Sunday = Mar 29
    expect(computeDefaultStartDate()).toBe('2026-03-29');
  });

  it('handles day 1 of month on a Saturday — Aug 1, 2026', () => {
    vi.setSystemTime(new Date('2026-08-01T15:00:00.000Z'));
    // Aug 1, 2026 = Saturday (dayOfWeek=6), Sunday = Jul 26
    expect(computeDefaultStartDate()).toBe('2026-07-26');
  });

  it('handles year boundary — Thursday Jan 1, 2026', () => {
    vi.setSystemTime(new Date('2026-01-01T15:00:00.000Z'));
    // Jan 1, 2026 = Thursday (dayOfWeek=4), Sunday = Dec 28, 2025
    expect(computeDefaultStartDate()).toBe('2025-12-28');
  });

  it('handles late-night UTC where ET is still previous day', () => {
    // 2026-03-28 at 03:00 UTC = 2026-03-27 at 11pm EDT (Friday)
    vi.setSystemTime(new Date('2026-03-28T03:00:00.000Z'));
    // Should compute Sunday of the week containing Friday Mar 27 = Mar 22
    expect(computeDefaultStartDate()).toBe('2026-03-22');
  });
});

// ---------------------------------------------------------------------------
// 6. Client-side display helpers
// ---------------------------------------------------------------------------

describe('client-side date display helpers', () => {
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /**
   * Simulates the client-side getWeekStart function from
   * ProviderWeeklyAvailabilityEditor.tsx
   */
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Simulates the client-side formatDateShort
   */
  function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: EASTERN_TZ });
  }

  it('getWeekStart returns Sunday for any day of the week', () => {
    // March 21, 2026 = Saturday
    vi.setSystemTime(new Date('2026-03-21T12:00:00'));
    const ws = getWeekStart(new Date());
    expect(ws.getDay()).toBe(0); // Sunday
    expect(ws.getDate()).toBe(15); // Mar 15
  });

  it('day header uses DAY_SHORT[day.dayOfWeek] correctly', () => {
    // Simulate server returning dayOfWeek=5 for March 27
    expect(DAY_SHORT[5]).toBe('Fri');
    expect(DAY_NAMES[5]).toBe('Friday');
  });

  it('formatDateShort shows correct date for Eastern timezone', () => {
    // Using T12:00:00 (noon local) avoids cross-day issues
    const result = formatDateShort('2026-03-27');
    expect(result).toContain('27');
    expect(result).toContain('Mar');
  });

  it('date number display uses correct date from date string', () => {
    // Client code: new Date(day.date + 'T00:00:00').getDate()
    // This works because T00:00:00 without Z parses as local time
    const dateStr = '2026-03-27';
    const d = new Date(dateStr + 'T00:00:00');
    expect(d.getDate()).toBe(27);
  });

  it('day name display matches the correct day', () => {
    // Client code: DAY_NAMES[new Date(editingDay.date + 'T00:00:00').getDay()]
    const dateStr = '2026-03-27'; // Friday
    const d = new Date(dateStr + 'T00:00:00');
    expect(DAY_NAMES[d.getDay()]).toBe('Friday');
  });

  it('all days in Mar 22-28 week display correctly', () => {
    const expectedDays = [
      { date: '2026-03-22', dayName: 'Sunday', dayNum: 22 },
      { date: '2026-03-23', dayName: 'Monday', dayNum: 23 },
      { date: '2026-03-24', dayName: 'Tuesday', dayNum: 24 },
      { date: '2026-03-25', dayName: 'Wednesday', dayNum: 25 },
      { date: '2026-03-26', dayName: 'Thursday', dayNum: 26 },
      { date: '2026-03-27', dayName: 'Friday', dayNum: 27 },
      { date: '2026-03-28', dayName: 'Saturday', dayNum: 28 },
    ];
    for (const { date, dayName, dayNum } of expectedDays) {
      const d = new Date(date + 'T00:00:00');
      expect(DAY_NAMES[d.getDay()]).toBe(dayName);
      expect(d.getDate()).toBe(dayNum);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. addCalendarDaysET and boundary helpers
// ---------------------------------------------------------------------------

describe('addCalendarDaysET', () => {
  it('adds days within the same month', () => {
    const start = parseDateET('2026-03-15');
    const result = addCalendarDaysET(start, 5);
    expect(toDateStringET(result)).toBe('2026-03-20');
  });

  it('adds days across month boundary', () => {
    const start = parseDateET('2026-03-30');
    const result = addCalendarDaysET(start, 3);
    expect(toDateStringET(result)).toBe('2026-04-02');
  });

  it('subtracts days (negative delta)', () => {
    const start = parseDateET('2026-03-03');
    const result = addCalendarDaysET(start, -5);
    expect(toDateStringET(result)).toBe('2026-02-26');
  });

  it('works across DST spring-forward', () => {
    const start = parseDateET('2026-03-07');
    const result = addCalendarDaysET(start, 2);
    expect(toDateStringET(result)).toBe('2026-03-09');
  });

  it('works across DST fall-back', () => {
    const start = parseDateET('2026-10-31');
    const result = addCalendarDaysET(start, 2);
    expect(toDateStringET(result)).toBe('2026-11-02');
  });
});

describe('startOfDayET / endOfDayET', () => {
  it('startOfDayET returns midnight ET for the date', () => {
    const d = parseDateET('2026-03-27');
    const start = startOfDayET(d);
    expect(toDateStringET(start)).toBe('2026-03-27');
  });

  it('endOfDayET returns midnight ET of the next date', () => {
    const d = parseDateET('2026-03-27');
    const end = endOfDayET(d);
    expect(toDateStringET(end)).toBe('2026-03-28');
  });
});

// ---------------------------------------------------------------------------
// 8. Full round-trip: every date in 2026 survives parseDateET → toDateStringET
// ---------------------------------------------------------------------------

describe('full year round-trip', () => {
  it('every date in 2026 survives parseDateET → toDateStringET', () => {
    const failures: string[] = [];
    const start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const roundTripped = toDateStringET(parseDateET(dateStr));
      if (roundTripped !== dateStr) {
        failures.push(`${dateStr} → ${roundTripped}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('every date in 2026 survives the corrected override save flow', () => {
    const failures: string[] = [];
    const start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      // Fixed flow: parseDateET → toDateStringET → dbDate → dbDateToString
      const stored = dbDate(toDateStringET(parseDateET(dateStr)));
      const final = dbDateToString(stored);
      if (final !== dateStr) {
        failures.push(`${dateStr} → ${final}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('the OLD buggy flow fails for every date in 2026', () => {
    let shiftedCount = 0;
    const start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      // Old buggy flow: dbDate → toDateStringET → dbDate → dbDateToString
      const stored = dbDate(toDateStringET(dbDate(dateStr)));
      const final = dbDateToString(stored);
      if (final !== dateStr) {
        shiftedCount++;
      }
    }
    // Every single date should be shifted back by one day
    expect(shiftedCount).toBe(365);
  });
});
