/**
 * Shipment Schedule Service Tests
 * ================================
 * Tests for same-day-of-month refill date calculation and shipment series creation.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateShipmentDates,
  calculateShipmentsNeeded,
  requiresMultiShipment,
  DEFAULT_BUD_DAYS,
} from '@/lib/shipment-schedule/shipmentScheduleService';

describe('calculateShipmentsNeeded', () => {
  it('returns 1 for monthly plans', () => {
    expect(calculateShipmentsNeeded(1)).toBe(1);
  });

  it('returns 1 for 3-month plans', () => {
    expect(calculateShipmentsNeeded(3)).toBe(1);
  });

  it('returns 2 for 6-month plans', () => {
    expect(calculateShipmentsNeeded(6)).toBe(2);
  });

  it('returns 4 for 12-month plans', () => {
    expect(calculateShipmentsNeeded(12)).toBe(4);
  });

  it('returns at least 1 even for 0 months', () => {
    expect(calculateShipmentsNeeded(0)).toBe(1);
  });
});

describe('requiresMultiShipment', () => {
  it('returns false for 1-month', () => {
    expect(requiresMultiShipment(1)).toBe(false);
  });

  it('returns false for 3-month', () => {
    expect(requiresMultiShipment(3)).toBe(false);
  });

  it('returns true for 6-month', () => {
    expect(requiresMultiShipment(6)).toBe(true);
  });

  it('returns true for 12-month', () => {
    expect(requiresMultiShipment(12)).toBe(true);
  });
});

describe('calculateShipmentDates — same-day-of-month', () => {
  it('keeps same day for standard dates (Jan 15 → Apr 15, Jul 15, Oct 15)', () => {
    const start = new Date(2026, 0, 15); // Jan 15, 2026
    const dates = calculateShipmentDates(start, 4);

    expect(dates).toHaveLength(4);
    expect(dates[0].getMonth()).toBe(0); // Jan
    expect(dates[0].getDate()).toBe(15);
    expect(dates[1].getMonth()).toBe(3); // Apr
    expect(dates[1].getDate()).toBe(15);
    expect(dates[2].getMonth()).toBe(6); // Jul
    expect(dates[2].getDate()).toBe(15);
    expect(dates[3].getMonth()).toBe(9); // Oct
    expect(dates[3].getDate()).toBe(15);
  });

  it('clamps Jan 31 to Apr 30 (month-end clamping)', () => {
    const start = new Date(2026, 0, 31); // Jan 31, 2026
    const dates = calculateShipmentDates(start, 4);

    expect(dates[0].getDate()).toBe(31); // Jan 31
    expect(dates[1].getMonth()).toBe(3); // Apr
    expect(dates[1].getDate()).toBe(30); // Apr has 30 days → clamped
    expect(dates[2].getMonth()).toBe(6); // Jul
    expect(dates[2].getDate()).toBe(31); // Jul has 31 days → exact
    expect(dates[3].getMonth()).toBe(9); // Oct
    expect(dates[3].getDate()).toBe(31); // Oct has 31 days → exact
  });

  it('handles Feb 28 correctly in non-leap year', () => {
    const start = new Date(2027, 1, 28); // Feb 28, 2027 (not leap)
    const dates = calculateShipmentDates(start, 2);

    expect(dates[0].getMonth()).toBe(1); // Feb
    expect(dates[0].getDate()).toBe(28);
    expect(dates[1].getMonth()).toBe(4); // May
    expect(dates[1].getDate()).toBe(28);
  });

  it('handles leap year Feb 29 → May 29', () => {
    const start = new Date(2028, 1, 29); // Feb 29, 2028 (leap year)
    const dates = calculateShipmentDates(start, 2);

    expect(dates[0].getDate()).toBe(29); // Feb 29
    expect(dates[1].getMonth()).toBe(4); // May
    expect(dates[1].getDate()).toBe(29);
  });

  it('crosses year boundary correctly (Nov 10 → Feb 10, May 10, Aug 10)', () => {
    const start = new Date(2026, 10, 10); // Nov 10, 2026
    const dates = calculateShipmentDates(start, 4);

    expect(dates[0]).toEqual(new Date(2026, 10, 10)); // Nov 10, 2026
    expect(dates[1].getFullYear()).toBe(2027);
    expect(dates[1].getMonth()).toBe(1); // Feb 2027
    expect(dates[1].getDate()).toBe(10);
    expect(dates[2].getFullYear()).toBe(2027);
    expect(dates[2].getMonth()).toBe(4); // May 2027
    expect(dates[2].getDate()).toBe(10);
    expect(dates[3].getFullYear()).toBe(2027);
    expect(dates[3].getMonth()).toBe(7); // Aug 2027
    expect(dates[3].getDate()).toBe(10);
  });

  it('handles 6-month plan (2 shipments)', () => {
    const start = new Date(2026, 2, 20); // Mar 20, 2026
    const dates = calculateShipmentDates(start, 2);

    expect(dates).toHaveLength(2);
    expect(dates[0].getMonth()).toBe(2); // Mar
    expect(dates[0].getDate()).toBe(20);
    expect(dates[1].getMonth()).toBe(5); // Jun
    expect(dates[1].getDate()).toBe(20);
  });

  it('returns single date for 1 shipment', () => {
    const start = new Date(2026, 5, 1);
    const dates = calculateShipmentDates(start, 1);

    expect(dates).toHaveLength(1);
    expect(dates[0].getTime()).toBe(start.getTime());
  });

  it('handles Dec 31 → Mar 31, Jun 30 (clamp), Sep 30 (clamp)', () => {
    const start = new Date(2026, 11, 31); // Dec 31, 2026
    const dates = calculateShipmentDates(start, 4);

    expect(dates[0].getDate()).toBe(31); // Dec 31
    expect(dates[1].getMonth()).toBe(2); // Mar 2027
    expect(dates[1].getDate()).toBe(31);
    expect(dates[2].getMonth()).toBe(5); // Jun 2027
    expect(dates[2].getDate()).toBe(30); // Clamped: Jun has 30 days
    expect(dates[3].getMonth()).toBe(8); // Sep 2027
    expect(dates[3].getDate()).toBe(30); // Clamped: Sep has 30 days
  });

  it('preserves time-of-day from original date', () => {
    const start = new Date(2026, 0, 15, 14, 30, 45);
    const dates = calculateShipmentDates(start, 2);

    expect(dates[1].getHours()).toBe(14);
    expect(dates[1].getMinutes()).toBe(30);
    expect(dates[1].getSeconds()).toBe(45);
  });

  it('handles month 30 → Feb 28 clamping (non-leap)', () => {
    const start = new Date(2026, 10, 30); // Nov 30, 2026
    const dates = calculateShipmentDates(start, 2);

    expect(dates[1].getFullYear()).toBe(2027);
    expect(dates[1].getMonth()).toBe(1); // Feb 2027
    expect(dates[1].getDate()).toBe(28); // Feb has 28 days (non-leap) → clamped
  });

  it('handles month 30 → Feb 29 clamping (leap year)', () => {
    const start = new Date(2027, 10, 30); // Nov 30, 2027
    const dates = calculateShipmentDates(start, 2);

    expect(dates[1].getFullYear()).toBe(2028);
    expect(dates[1].getMonth()).toBe(1); // Feb 2028 (leap)
    expect(dates[1].getDate()).toBe(29); // Clamped to Feb 29
  });
});
