/**
 * Shared Reporting Constants & Utilities
 *
 * Single source of truth for all affiliate reporting filters and metrics.
 * Every reporting endpoint MUST import from here — never re-derive these patterns.
 *
 * @module services/affiliate/reportingConstants
 */

// ============================================================================
// Click Filter
// ============================================================================

/** Click filter: only touchType=CLICK counts as a click */
export const CLICK_FILTER = { touchType: 'CLICK' as const };

// ============================================================================
// Date Filters
// ============================================================================

/** Conversion filter: convertedAt must be within date range (implies non-null) */
export function conversionDateFilter(from: Date, to: Date) {
  return { convertedAt: { gte: from, lte: to } };
}

/** Revenue date filter: use occurredAt for commission events (when the payment actually occurred) */
export function revenueDateFilter(from: Date, to: Date) {
  return { occurredAt: { gte: from, lte: to } };
}

/** Standard createdAt date filter */
export function createdAtDateFilter(from: Date, to: Date) {
  return { createdAt: { gte: from, lte: to } };
}

// ============================================================================
// HIPAA Small-Number Suppression
// ============================================================================

/** HIPAA small-number suppression threshold (counts below this are masked) */
export const SMALL_NUMBER_THRESHOLD = 5;

/**
 * Suppress small numbers for HIPAA compliance.
 * Counts > 0 and < threshold are replaced with '<5' to prevent
 * re-identification of patients through small-cell analysis.
 */
export function suppressSmallNumber(count: number): number | string {
  return count > 0 && count < SMALL_NUMBER_THRESHOLD ? '<5' : count;
}

/**
 * Suppress conversion-related values when the count is below threshold.
 * Returns an object with potentially suppressed conversion count,
 * revenue, and commission values.
 */
export function suppressConversionMetrics(metrics: {
  conversions: number;
  revenueCents?: number;
  commissionCents?: number;
}): {
  conversions: number | string;
  revenueCents?: number | string;
  commissionCents?: number | string;
} {
  const isSuppressed = metrics.conversions > 0 && metrics.conversions < SMALL_NUMBER_THRESHOLD;

  return {
    conversions: isSuppressed ? '<5' : metrics.conversions,
    ...(metrics.revenueCents !== undefined && {
      revenueCents: isSuppressed ? '<5' : metrics.revenueCents,
    }),
    ...(metrics.commissionCents !== undefined && {
      commissionCents: isSuppressed ? '<5' : metrics.commissionCents,
    }),
  };
}

// ============================================================================
// Active Commission Statuses
// ============================================================================

/** Statuses that count as active/valid commissions (not reversed or failed) */
export const ACTIVE_COMMISSION_STATUSES = ['PENDING', 'APPROVED', 'PAID'] as const;

// ============================================================================
// Default Date Ranges
// ============================================================================

/** Get the start of the current month */
export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Get the end of today */
export function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}
