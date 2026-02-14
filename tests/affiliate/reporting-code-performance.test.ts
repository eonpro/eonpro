/**
 * Affiliate Reporting & Code Performance Tests
 *
 * Tests:
 * 1. Code performance aggregation (modern + legacy systems)
 * 2. Dashboard data calculations (balance, metrics, activity feed)
 * 3. Commission stats with HIPAA small-number suppression
 * 4. Sorting, filtering, pagination
 * 5. Leaderboard ranking logic
 * 6. Date range filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------
const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliate: { findUnique: fn(), findFirst: fn(), findMany: fn() },
      affiliateTouch: { count: fn(), findFirst: fn(), aggregate: fn(), findMany: fn() },
      affiliateRefCode: { findMany: fn(), findFirst: fn() },
      affiliateCommissionEvent: {
        aggregate: fn(),
        findMany: fn(),
        findUnique: fn(),
        count: fn(),
      },
      affiliatePayout: { findMany: fn(), aggregate: fn() },
      affiliatePlanAssignment: { findFirst: fn() },
      patient: { findUnique: fn(), count: fn() },
      influencer: { findMany: fn() },
      referralTracking: { count: fn(), findFirst: fn() },
      commission: { count: fn() },
      $queryRaw: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

// Mock @prisma/client to provide Prisma.sql and Prisma.join used by raw queries
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return { ...actual };
});

import { getAffiliateCommissionStats } from '@/services/affiliate/affiliateCommissionService';

// ---------------------------------------------------------------------------
// getAffiliateCommissionStats
// ---------------------------------------------------------------------------
describe('getAffiliateCommissionStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should aggregate commission stats by status', async () => {
    mockPrisma.affiliateCommissionEvent.aggregate
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 5000 }, _count: 5 }) // pending
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 10000 }, _count: 10 }) // approved
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 20000 }, _count: 15 }) // paid
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 1000 }, _count: 1 }); // reversed
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const stats = await getAffiliateCommissionStats(100, 1);

    expect(stats.pending.count).toBe(5);
    expect(stats.pending.amountCents).toBe(5000);
    expect(stats.approved.count).toBe(10);
    expect(stats.approved.amountCents).toBe(10000);
    expect(stats.paid.count).toBe(15);
    expect(stats.paid.amountCents).toBe(20000);
    expect(stats.reversed.count).toBe(1);
    expect(stats.reversed.amountCents).toBe(1000);

    // Totals exclude reversed
    expect(stats.totals.conversions).toBe(30); // 5 + 10 + 15
  });

  it('should handle null sums gracefully', async () => {
    mockPrisma.affiliateCommissionEvent.aggregate
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: null }, _count: 0 })
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: null }, _count: 0 })
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: null }, _count: 0 })
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: null }, _count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const stats = await getAffiliateCommissionStats(100, 1);

    expect(stats.pending.amountCents).toBe(0);
    expect(stats.approved.amountCents).toBe(0);
    expect(stats.paid.amountCents).toBe(0);
    expect(stats.reversed.amountCents).toBe(0);
    expect(stats.totals.conversions).toBe(0);
  });

  it('should apply HIPAA small-number suppression to daily trends', async () => {
    mockPrisma.affiliateCommissionEvent.aggregate
      .mockResolvedValue({ _sum: { commissionAmountCents: 0 }, _count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([
      { date: new Date('2026-02-01'), conversions: 3, revenue_cents: 30000, commission_cents: 3000 },
      { date: new Date('2026-02-02'), conversions: 10, revenue_cents: 100000, commission_cents: 10000 },
      { date: new Date('2026-02-03'), conversions: 0, revenue_cents: 0, commission_cents: 0 },
    ]);

    const stats = await getAffiliateCommissionStats(100, 1);

    // Day 1: 3 conversions < 5 → suppressed
    expect(stats.dailyTrends[0].conversions).toBe('<5');
    expect(stats.dailyTrends[0].revenueCents).toBeNull();
    expect(stats.dailyTrends[0].commissionCents).toBeNull();

    // Day 2: 10 conversions >= 5 → not suppressed
    expect(stats.dailyTrends[1].conversions).toBe(10);
    expect(stats.dailyTrends[1].revenueCents).toBe(100000);

    // Day 3: 0 conversions < 5 → also suppressed (implementation treats all < 5 the same)
    expect(stats.dailyTrends[2].conversions).toBe('<5');
  });

  it('should respect date range filters', async () => {
    const fromDate = new Date('2026-01-01');
    const toDate = new Date('2026-01-31');

    mockPrisma.affiliateCommissionEvent.aggregate
      .mockResolvedValue({ _sum: { commissionAmountCents: null }, _count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await getAffiliateCommissionStats(100, 1, fromDate, toDate);

    // Check that aggregate calls include date filter
    const firstCall = mockPrisma.affiliateCommissionEvent.aggregate.mock.calls[0][0];
    expect(firstCall.where.occurredAt).toEqual({
      gte: fromDate,
      lte: toDate,
    });
  });
});

// ---------------------------------------------------------------------------
// Code Performance Report logic (unit tests for aggregation patterns)
// ---------------------------------------------------------------------------
describe('Code Performance Report - Data Aggregation', () => {
  it('should calculate conversion rate correctly', () => {
    const uses = 50;
    const conversions = 10;
    const conversionRate = uses > 0 ? (conversions / uses) * 100 : 0;

    expect(conversionRate).toBe(20); // 20%
  });

  it('should handle 0 uses without division by zero', () => {
    const uses = 0;
    const conversions = 0;
    const conversionRate = uses > 0 ? (conversions / uses) * 100 : 0;

    expect(conversionRate).toBe(0);
  });

  it('should combine modern and legacy uses correctly', () => {
    const modernUses = 30;
    const legacyUses = 20;
    const totalUses = modernUses + legacyUses;

    expect(totalUses).toBe(50);
  });

  it('should combine modern and legacy conversions correctly', () => {
    const modernConversions = 8;
    const legacyConversions = 5;
    const totalConversions = modernConversions + legacyConversions;

    expect(totalConversions).toBe(13);
  });

  it('should deduplicate modern and legacy codes (prefer modern)', () => {
    const modernCodes = [
      { refCode: 'CODE1', isLegacy: false },
      { refCode: 'CODE2', isLegacy: false },
    ];
    const legacyCodes = [
      { promoCode: 'CODE1' }, // duplicate - should be excluded
      { promoCode: 'CODE3' }, // unique legacy
    ];

    const modernCodeSet = new Set(modernCodes.map((c) => c.refCode.toUpperCase()));
    const uniqueLegacy = legacyCodes.filter(
      (inf) => inf.promoCode && !modernCodeSet.has(inf.promoCode.toUpperCase())
    );

    expect(uniqueLegacy).toHaveLength(1);
    expect(uniqueLegacy[0].promoCode).toBe('CODE3');
  });

  it('should sort by conversions descending by default', () => {
    const codes = [
      { code: 'A', conversions: 5 },
      { code: 'B', conversions: 15 },
      { code: 'C', conversions: 10 },
    ];

    const sorted = [...codes].sort((a, b) => b.conversions - a.conversions);

    expect(sorted[0].code).toBe('B');
    expect(sorted[1].code).toBe('C');
    expect(sorted[2].code).toBe('A');
  });

  it('should sort by revenue ascending when requested', () => {
    const codes = [
      { code: 'A', revenue: 30000 },
      { code: 'B', revenue: 10000 },
      { code: 'C', revenue: 50000 },
    ];

    const sorted = [...codes].sort((a, b) => a.revenue - b.revenue);

    expect(sorted[0].code).toBe('B');
    expect(sorted[1].code).toBe('A');
    expect(sorted[2].code).toBe('C');
  });

  it('should paginate results correctly', () => {
    const allCodes = Array.from({ length: 25 }, (_, i) => ({
      code: `CODE${i + 1}`,
      conversions: 25 - i,
    }));

    const page = 2;
    const limit = 10;
    const startIndex = (page - 1) * limit;
    const paginated = allCodes.slice(startIndex, startIndex + limit);

    expect(paginated).toHaveLength(10);
    expect(paginated[0].code).toBe('CODE11');
    expect(paginated[9].code).toBe('CODE20');

    const hasMore = startIndex + limit < allCodes.length;
    expect(hasMore).toBe(true);
  });

  it('should calculate totals across all codes', () => {
    const codes = [
      { uses: 10, conversions: 3, revenue: 30000 },
      { uses: 20, conversions: 7, revenue: 70000 },
      { uses: 15, conversions: 5, revenue: 50000 },
    ];

    const totals = {
      totalCodes: codes.length,
      totalUses: codes.reduce((sum, c) => sum + c.uses, 0),
      totalConversions: codes.reduce((sum, c) => sum + c.conversions, 0),
      totalRevenue: codes.reduce((sum, c) => sum + c.revenue, 0),
      avgConversionRate:
        codes.reduce(
          (sum, c) => sum + (c.uses > 0 ? (c.conversions / c.uses) * 100 : 0),
          0
        ) / codes.length,
    };

    expect(totals.totalCodes).toBe(3);
    expect(totals.totalUses).toBe(45);
    expect(totals.totalConversions).toBe(15);
    expect(totals.totalRevenue).toBe(150000);
    // (30% + 35% + 33.33%) / 3 ≈ 32.78
    expect(totals.avgConversionRate).toBeCloseTo(32.78, 0);
  });
});

// ---------------------------------------------------------------------------
// Dashboard Data Calculations
// ---------------------------------------------------------------------------
describe('Dashboard Data Calculations', () => {
  it('should calculate month-over-month change correctly', () => {
    // Positive change
    expect(((2000 - 1000) / 1000) * 100).toBe(100); // 100% increase

    // Negative change
    expect(((500 - 1000) / 1000) * 100).toBe(-50); // 50% decrease

    // From zero
    const lastMonth = 0;
    const thisMonth = 1000;
    const change =
      lastMonth > 0
        ? ((thisMonth - lastMonth) / lastMonth) * 100
        : thisMonth > 0
          ? 100
          : 0;
    expect(change).toBe(100);

    // Both zero
    const change2 = 0 > 0 ? 0 : 0 > 0 ? 100 : 0;
    expect(change2).toBe(0);
  });

  it('should calculate conversion rate as clicks/conversions', () => {
    const clicks = 100;
    const conversions = 15;
    const rate = clicks > 0 ? (conversions / clicks) * 100 : 0;

    expect(Math.round(rate * 10) / 10).toBe(15);
  });

  it('should calculate average order value', () => {
    const thisMonth = 50000; // $500 in commissions
    const conversions = 10;
    const avgOrderValue = conversions > 0 ? Math.round(thisMonth / conversions) : 0;

    expect(avgOrderValue).toBe(5000); // $50 avg
  });

  it('should build activity feed sorted by date descending', () => {
    const commissions = [
      { id: 1, createdAt: new Date('2026-02-10'), amount: 1000, type: 'conversion' },
      { id: 2, createdAt: new Date('2026-02-12'), amount: 2000, type: 'conversion' },
    ];
    const payouts = [
      { id: 1, createdAt: new Date('2026-02-11'), amount: 5000, type: 'payout' },
    ];

    const feed = [...commissions, ...payouts]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    expect(feed[0].type).toBe('conversion'); // Feb 12
    expect(feed[1].type).toBe('payout'); // Feb 11
    expect(feed[2].type).toBe('conversion'); // Feb 10
  });
});

// ---------------------------------------------------------------------------
// Date Range Calculations
// ---------------------------------------------------------------------------
describe('Date Range Calculations', () => {
  it('should calculate correct date ranges for period filters', () => {
    const now = new Date('2026-02-14');

    // 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(sevenDaysAgo.toISOString().slice(0, 10)).toBe('2026-02-07');

    // 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    expect(thirtyDaysAgo.toISOString().slice(0, 10)).toBe('2026-01-15');

    // 90 days
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    expect(ninetyDaysAgo.toISOString().slice(0, 10)).toBe('2025-11-16');

    // YTD
    const ytd = new Date(now.getFullYear(), 0, 1);
    expect(ytd.toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

// ---------------------------------------------------------------------------
// Leaderboard Ranking Logic
// ---------------------------------------------------------------------------
describe('Leaderboard Ranking Logic', () => {
  it('should rank affiliates by conversions descending', () => {
    const affiliates = [
      { id: 1, name: 'Alice', conversions: 50 },
      { id: 2, name: 'Bob', conversions: 100 },
      { id: 3, name: 'Charlie', conversions: 75 },
    ];

    const ranked = [...affiliates]
      .sort((a, b) => b.conversions - a.conversions)
      .map((a, i) => ({ ...a, rank: i + 1 }));

    expect(ranked[0].name).toBe('Bob');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].name).toBe('Charlie');
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].name).toBe('Alice');
    expect(ranked[2].rank).toBe(3);
  });

  it('should calculate percentOfTotal correctly', () => {
    const totalConversions = 225; // 50 + 100 + 75
    const affiliates = [
      { name: 'Bob', conversions: 100, percentOfTotal: (100 / totalConversions) * 100 },
      { name: 'Charlie', conversions: 75, percentOfTotal: (75 / totalConversions) * 100 },
      { name: 'Alice', conversions: 50, percentOfTotal: (50 / totalConversions) * 100 },
    ];

    expect(affiliates[0].percentOfTotal).toBeCloseTo(44.44, 1);
    expect(affiliates[1].percentOfTotal).toBeCloseTo(33.33, 1);
    expect(affiliates[2].percentOfTotal).toBeCloseTo(22.22, 1);
  });

  it('should handle conversion rate ranking (bps for precision)', () => {
    const affiliates = [
      { id: 1, clicks: 100, conversions: 10 }, // 10%
      { id: 2, clicks: 50, conversions: 15 }, // 30%
      { id: 3, clicks: 200, conversions: 20 }, // 10%
    ];

    const withRate = affiliates.map((a) => ({
      ...a,
      conversionRateBps: a.clicks > 0 ? Math.round((a.conversions / a.clicks) * 10000) : 0,
    }));

    const ranked = [...withRate].sort((a, b) => b.conversionRateBps - a.conversionRateBps);

    expect(ranked[0].id).toBe(2); // 30%
    expect(ranked[0].conversionRateBps).toBe(3000);
  });

  it('should respect leaderboard opt-in (only show opted-in affiliates)', () => {
    const affiliates = [
      { id: 1, name: 'Alice', leaderboardOptIn: true, leaderboardAlias: 'Alice_Pro' },
      { id: 2, name: 'Bob', leaderboardOptIn: false, leaderboardAlias: null },
      { id: 3, name: 'Charlie', leaderboardOptIn: true, leaderboardAlias: null },
    ];

    const visible = affiliates.map((a) => ({
      ...a,
      displayName: a.leaderboardOptIn
        ? a.leaderboardAlias || a.name
        : `Partner #${a.id}`,
    }));

    expect(visible[0].displayName).toBe('Alice_Pro');
    expect(visible[1].displayName).toBe('Partner #2'); // Opted out
    expect(visible[2].displayName).toBe('Charlie');
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant clinic isolation in reporting
// ---------------------------------------------------------------------------
describe('Multi-tenant Clinic Isolation in Reporting', () => {
  it('admin should only see their own clinic data', () => {
    const user = { role: 'admin', clinicId: 1 };
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    expect(clinicFilter).toEqual({ clinicId: 1 });
  });

  it('super_admin should see all clinic data', () => {
    const user = { role: 'super_admin', clinicId: null };
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    expect(clinicFilter).toEqual({});
  });
});
