/**
 * Test Script: Shipment Schedule Service
 * =======================================
 * 
 * Tests the multi-shipment scheduling logic for 6-month and 12-month packages
 * with 90-day BUD (Beyond Use Date) constraint.
 * 
 * Run: npx tsx scripts/test-shipment-schedule.ts
 */

import {
  calculateShipmentsNeeded,
  requiresMultiShipment,
  calculateShipmentDates,
  getPackageMonthsFromSubscription,
  DEFAULT_BUD_DAYS,
} from '../src/lib/shipment-schedule/shipmentScheduleService';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passCount++;
  } catch (error: any) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
    failCount++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    },
  };
}

console.log('\n' + CYAN + '═'.repeat(60) + RESET);
console.log(CYAN + ' Shipment Schedule Service Tests' + RESET);
console.log(CYAN + '═'.repeat(60) + RESET + '\n');

// ============================================================================
// Test: calculateShipmentsNeeded
// ============================================================================

console.log(YELLOW + '▸ calculateShipmentsNeeded()' + RESET);

test('1-month package needs 1 shipment', () => {
  expect(calculateShipmentsNeeded(1)).toBe(1);
});

test('2-month package needs 1 shipment', () => {
  expect(calculateShipmentsNeeded(2)).toBe(1);
});

test('3-month package needs 1 shipment (exactly 90 days)', () => {
  expect(calculateShipmentsNeeded(3)).toBe(1);
});

test('4-month package needs 2 shipments (120 days / 90 = 1.33 → 2)', () => {
  expect(calculateShipmentsNeeded(4)).toBe(2);
});

test('6-month package needs 2 shipments (180 days / 90 = 2)', () => {
  expect(calculateShipmentsNeeded(6)).toBe(2);
});

test('9-month package needs 3 shipments (270 days / 90 = 3)', () => {
  expect(calculateShipmentsNeeded(9)).toBe(3);
});

test('12-month package needs 4 shipments (360 days / 90 = 4)', () => {
  expect(calculateShipmentsNeeded(12)).toBe(4);
});

test('Custom BUD: 6-month with 60-day BUD needs 3 shipments', () => {
  expect(calculateShipmentsNeeded(6, 60)).toBe(3);
});

// ============================================================================
// Test: requiresMultiShipment
// ============================================================================

console.log('\n' + YELLOW + '▸ requiresMultiShipment()' + RESET);

test('1-month does NOT require multi-shipment', () => {
  expect(requiresMultiShipment(1)).toBeFalsy();
});

test('3-month does NOT require multi-shipment', () => {
  expect(requiresMultiShipment(3)).toBeFalsy();
});

test('4-month DOES require multi-shipment', () => {
  expect(requiresMultiShipment(4)).toBeTruthy();
});

test('6-month DOES require multi-shipment', () => {
  expect(requiresMultiShipment(6)).toBeTruthy();
});

test('12-month DOES require multi-shipment', () => {
  expect(requiresMultiShipment(12)).toBeTruthy();
});

// ============================================================================
// Test: calculateShipmentDates
// ============================================================================

console.log('\n' + YELLOW + '▸ calculateShipmentDates()' + RESET);

test('6-month: 2 shipments at day 0 and day 90', () => {
  const startDate = new Date('2026-01-01T12:00:00Z'); // Use noon UTC to avoid timezone edge cases
  const dates = calculateShipmentDates(startDate, 2, 90);
  
  expect(dates.length).toBe(2);
  // Verify 90-day gap between shipments
  const daysBetween = Math.round((dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24));
  expect(daysBetween).toBe(90);
});

test('12-month: 4 shipments at day 0, 90, 180, 270', () => {
  const startDate = new Date('2026-01-01T12:00:00Z'); // Use noon UTC to avoid timezone edge cases
  const dates = calculateShipmentDates(startDate, 4, 90);
  
  expect(dates.length).toBe(4);
  // Verify 90-day gaps between each shipment
  for (let i = 1; i < dates.length; i++) {
    const daysBetween = Math.round((dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24));
    expect(daysBetween).toBe(90);
  }
});

test('3-month with 60-day BUD: 2 shipments at day 0 and day 60', () => {
  const startDate = new Date('2026-01-01');
  const dates = calculateShipmentDates(startDate, 2, 60);
  
  expect(dates.length).toBe(2);
  expect(dates[0].toISOString().slice(0, 10)).toBe('2026-01-01');
  expect(dates[1].toISOString().slice(0, 10)).toBe('2026-03-02');
});

// ============================================================================
// Test: getPackageMonthsFromSubscription
// ============================================================================

console.log('\n' + YELLOW + '▸ getPackageMonthsFromSubscription()' + RESET);

test('vialCount=6 returns 6 months', () => {
  const subscription = { vialCount: 6 } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(6);
});

test('vialCount=12 returns 12 months', () => {
  const subscription = { vialCount: 12 } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(12);
});

test('planName "Semaglutide 6 Month" returns 6', () => {
  const subscription = { planName: 'Semaglutide 6 Month' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(6);
});

test('planName "12-Month Package" returns 12', () => {
  const subscription = { planName: '12-Month Package' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(12);
});

test('planId "sema_6month_default" returns 6', () => {
  const subscription = { planId: 'sema_6month_default' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(6);
});

test('planId "tirz_12month_3ml" returns 12', () => {
  const subscription = { planId: 'tirz_12month_3ml' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(12);
});

test('planId containing "annual" returns 12', () => {
  const subscription = { planId: 'sema_annual_premium' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(12);
});

test('planId containing "quarterly" returns 3', () => {
  const subscription = { planId: 'tirz_quarterly_basic' } as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(3);
});

test('Empty subscription defaults to 1 month', () => {
  const subscription = {} as any;
  expect(getPackageMonthsFromSubscription(subscription)).toBe(1);
});

// ============================================================================
// Integration Tests: Full Schedule Calculation
// ============================================================================

console.log('\n' + YELLOW + '▸ Integration: Full Schedule Simulation' + RESET);

test('6-month package full schedule simulation', () => {
  const packageMonths = 6;
  const budDays = DEFAULT_BUD_DAYS; // 90
  const startDate = new Date('2026-02-04'); // Today
  
  const totalShipments = calculateShipmentsNeeded(packageMonths, budDays);
  const dates = calculateShipmentDates(startDate, totalShipments, budDays);
  
  expect(totalShipments).toBe(2);
  expect(dates.length).toBe(2);
  
  console.log(`    ${CYAN}6-Month Package Schedule:${RESET}`);
  dates.forEach((date, i) => {
    const status = i === 0 ? 'PENDING_PAYMENT' : 'SCHEDULED';
    console.log(`      Shipment ${i + 1}: ${date.toISOString().slice(0, 10)} (${status})`);
  });
});

test('12-month package full schedule simulation', () => {
  const packageMonths = 12;
  const budDays = DEFAULT_BUD_DAYS; // 90
  const startDate = new Date('2026-02-04'); // Today
  
  const totalShipments = calculateShipmentsNeeded(packageMonths, budDays);
  const dates = calculateShipmentDates(startDate, totalShipments, budDays);
  
  expect(totalShipments).toBe(4);
  expect(dates.length).toBe(4);
  
  console.log(`    ${CYAN}12-Month Package Schedule:${RESET}`);
  dates.forEach((date, i) => {
    const status = i === 0 ? 'PENDING_PAYMENT' : 'SCHEDULED';
    console.log(`      Shipment ${i + 1}: ${date.toISOString().slice(0, 10)} (${status})`);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

console.log('\n' + YELLOW + '▸ Edge Cases' + RESET);

test('0-month package returns at least 1 shipment', () => {
  expect(calculateShipmentsNeeded(0)).toBe(1);
});

test('Negative months returns at least 1 shipment', () => {
  expect(calculateShipmentsNeeded(-1)).toBe(1);
});

test('Very large package (36 months) calculates correctly', () => {
  expect(calculateShipmentsNeeded(36)).toBe(12); // 1080 days / 90 = 12
});

test('Plan name parsing is case-insensitive', () => {
  const sub1 = { planName: 'SEMAGLUTIDE 6 MONTH' } as any;
  const sub2 = { planName: 'semaglutide 6 month' } as any;
  expect(getPackageMonthsFromSubscription(sub1)).toBe(6);
  expect(getPackageMonthsFromSubscription(sub2)).toBe(6);
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + CYAN + '═'.repeat(60) + RESET);
console.log(`${CYAN}Test Results:${RESET}`);
console.log(`  ${GREEN}Passed: ${passCount}${RESET}`);
console.log(`  ${failCount > 0 ? RED : GREEN}Failed: ${failCount}${RESET}`);
console.log(CYAN + '═'.repeat(60) + RESET + '\n');

if (failCount > 0) {
  process.exit(1);
}
