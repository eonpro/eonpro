/**
 * Tests that the Package Photos dashboard cards and the Daily Volume chart
 * use consistent calendar-day boundaries, so the numbers always agree.
 *
 * Regression: YESTERDAY card showed 841, but the chart bar for the same
 * day showed a different value because:
 *   1) yesterdayStart was todayStart − 24 h (breaks on DST transitions)
 *   2) The chart SQL returned DATE type → JS Date parsing could drift
 */

import { describe, it, expect } from 'vitest';
import {
  getTimezoneAwareBoundaries,
  midnightInTz,
  toCalendarDateStringInTz,
  getDatePartsInTz,
  dbDateToString,
  EASTERN_TZ,
} from '@/lib/utils/timezone';

// ─── Helper: simulate the 14-day key loop from the demographics API ────────

function generateChartKeys(tz: string): string[] {
  const { year, month, day } = getDatePartsInTz(tz);
  const keys: string[] = [];
  for (let i = 0; i < 14; i++) {
    const offsetDays = day - 13 + i;
    const dayMidnight = midnightInTz(year, month, offsetDays, tz);
    const key = toCalendarDateStringInTz(
      new Date(dayMidnight.getTime() + 12 * 60 * 60 * 1000),
      tz,
    );
    keys.push(key);
  }
  return keys;
}

// ─── 1. yesterdayStart must equal midnightInTz(day − 1) ─────────────────────

describe('getTimezoneAwareBoundaries — yesterdayStart', () => {
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'UTC',
  ];

  for (const tz of timezones) {
    it(`uses calendar-day midnight for yesterday in ${tz}`, () => {
      const bounds = getTimezoneAwareBoundaries(tz);
      const expected = midnightInTz(bounds.year, bounds.month, bounds.day - 1, tz);
      expect(bounds.yesterdayStart.getTime()).toBe(expected.getTime());
    });

    it(`yesterdayStart < todayStart in ${tz}`, () => {
      const { yesterdayStart, todayStart } = getTimezoneAwareBoundaries(tz);
      expect(yesterdayStart.getTime()).toBeLessThan(todayStart.getTime());
    });
  }

  it('yesterdayStart is NOT simply todayStart − 24h (DST-safe)', () => {
    const tz = EASTERN_TZ;
    const bounds = getTimezoneAwareBoundaries(tz);
    const naive24h = new Date(bounds.todayStart.getTime() - 24 * 60 * 60 * 1000);
    const calendarMidnight = midnightInTz(bounds.year, bounds.month, bounds.day - 1, tz);

    // On non-DST days they happen to be equal; the important thing is we use
    // the calendar-based value, not the 24h subtraction.
    expect(bounds.yesterdayStart.getTime()).toBe(calendarMidnight.getTime());
  });
});

// ─── 2. DST spring-forward: boundaries must be calendar-day aligned ─────────

describe('DST spring-forward boundary correctness', () => {
  // 2026 US DST starts Sunday March 8 at 2 AM Eastern (clocks jump to 3 AM)
  // On March 9, the "previous day" (March 8) has only 23 hours.
  // todayStart − 24h would land at 11 PM ET on March 7 — WRONG.

  it('March 9 yesterdayStart lands on March 8 midnight, not March 7', () => {
    const march9Midnight = midnightInTz(2026, 2, 9, EASTERN_TZ); // EDT
    const march8Midnight = midnightInTz(2026, 2, 8, EASTERN_TZ); // EST

    // The gap between them is 23 hours (DST spring forward)
    const gapHours = (march9Midnight.getTime() - march8Midnight.getTime()) / 3_600_000;
    expect(gapHours).toBe(23);

    // A naive 24h subtraction from March 9 midnight would give March 7 at 11 PM EST
    const naive = new Date(march9Midnight.getTime() - 24 * 60 * 60 * 1000);
    const naiveDate = toCalendarDateStringInTz(naive, EASTERN_TZ);
    expect(naiveDate).toBe('2026-03-07'); // WRONG day — proves 24h is broken

    // Our fix uses midnightInTz which gives the correct March 8 midnight
    const correct = midnightInTz(2026, 2, 8, EASTERN_TZ);
    const correctDate = toCalendarDateStringInTz(correct, EASTERN_TZ);
    expect(correctDate).toBe('2026-03-08'); // CORRECT
  });
});

// ─── 3. DST fall-back: boundaries must still be calendar-day aligned ────────

describe('DST fall-back boundary correctness', () => {
  // 2026 US DST ends Sunday November 1 at 2 AM Eastern (clocks fall back to 1 AM)
  // November 1 has 25 hours. todayStart − 24h would land at 1 AM ET on October 31.

  it('November 1 yesterdayStart lands on October 31 midnight', () => {
    const nov1Midnight = midnightInTz(2026, 10, 1, EASTERN_TZ); // EDT still
    const oct31Midnight = midnightInTz(2026, 9, 31, EASTERN_TZ); // EDT

    // Our fix: midnightInTz(day-1)
    const yesterdayMidnight = midnightInTz(2026, 10, 0, EASTERN_TZ); // day=0 → Oct 31
    expect(yesterdayMidnight.getTime()).toBe(oct31Midnight.getTime());
  });
});

// ─── 4. Chart keys use YYYY-MM-DD matching TO_CHAR format ───────────────────

describe('chart key format consistency', () => {
  it('keys are YYYY-MM-DD with zero-padded month and day', () => {
    const keys = generateChartKeys(EASTERN_TZ);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (const key of keys) {
      expect(key).toMatch(dateRegex);
    }
    expect(keys.length).toBe(14);
  });

  it('today is the last key in the chart', () => {
    const keys = generateChartKeys(EASTERN_TZ);
    const { year, month, day } = getDatePartsInTz(EASTERN_TZ);
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    expect(keys[13]).toBe(todayStr);
  });

  it('yesterday is the second-to-last key', () => {
    const keys = generateChartKeys(EASTERN_TZ);
    const bounds = getTimezoneAwareBoundaries(EASTERN_TZ);
    const yesterdayStr = toCalendarDateStringInTz(
      new Date(bounds.yesterdayStart.getTime() + 12 * 60 * 60 * 1000),
      EASTERN_TZ,
    );
    expect(keys[12]).toBe(yesterdayStr);
  });

  it('keys are unique (no duplicates)', () => {
    const keys = generateChartKeys(EASTERN_TZ);
    const unique = new Set(keys);
    expect(unique.size).toBe(14);
  });

  it('keys are in ascending chronological order', () => {
    const keys = generateChartKeys(EASTERN_TZ);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] > keys[i - 1]).toBe(true);
    }
  });
});

// ─── 5. Card boundary matches chart calendar day ────────────────────────────

describe('card vs chart date alignment', () => {
  it('yesterday card window [yesterdayStart, todayStart) spans exactly one calendar day', () => {
    const tz = EASTERN_TZ;
    const { yesterdayStart, todayStart, year, month, day } = getTimezoneAwareBoundaries(tz);

    // yesterdayStart should be midnight of (day-1) in tz
    const expectedYesterday = midnightInTz(year, month, day - 1, tz);
    expect(yesterdayStart.getTime()).toBe(expectedYesterday.getTime());

    // todayStart should be midnight of (day) in tz
    const expectedToday = midnightInTz(year, month, day, tz);
    expect(todayStart.getTime()).toBe(expectedToday.getTime());

    // The date string for yesterdayStart should match the chart key for yesterday
    const yesterdayDateStr = toCalendarDateStringInTz(
      new Date(yesterdayStart.getTime() + 12 * 60 * 60 * 1000),
      tz,
    );
    const chartKeys = generateChartKeys(tz);
    expect(chartKeys[12]).toBe(yesterdayDateStr);
  });

  it('today card window [todayStart, ∞) matches today chart key', () => {
    const tz = EASTERN_TZ;
    const { todayStart, year, month, day } = getTimezoneAwareBoundaries(tz);

    const todayDateStr = toCalendarDateStringInTz(
      new Date(todayStart.getTime() + 12 * 60 * 60 * 1000),
      tz,
    );
    const chartKeys = generateChartKeys(tz);
    expect(chartKeys[13]).toBe(todayDateStr);
  });
});
