import { describe, expect, it } from 'vitest';
import { buildMatchSummary } from '@/lib/package-photos/stats';
import { getTimezoneAwareBoundaries, midnightInTz, EASTERN_TZ } from '@/lib/utils/timezone';

describe('buildMatchSummary', () => {
  it('computes unmatched and match rate from the same scope', () => {
    const summary = buildMatchSummary(176, 64);
    expect(summary).toEqual({
      total: 176,
      matched: 64,
      unmatched: 112,
      matchRate: 36,
    });
  });

  it('handles empty totals safely', () => {
    const summary = buildMatchSummary(0, 0);
    expect(summary).toEqual({
      total: 0,
      matched: 0,
      unmatched: 0,
      matchRate: 0,
    });
  });

  it('clamps invalid matched values into [0, total]', () => {
    expect(buildMatchSummary(10, 99)).toEqual({
      total: 10,
      matched: 10,
      unmatched: 0,
      matchRate: 100,
    });
    expect(buildMatchSummary(10, -3)).toEqual({
      total: 10,
      matched: 0,
      unmatched: 10,
      matchRate: 0,
    });
  });

  it('uses bounded month-to-date windows (inclusive start, exclusive tomorrow)', () => {
    const { year, month, day, monthStart } = getTimezoneAwareBoundaries(EASTERN_TZ);
    const tomorrowStart = midnightInTz(year, month, day + 1, EASTERN_TZ);
    expect(monthStart.getTime()).toBeLessThan(tomorrowStart.getTime());
  });
});
