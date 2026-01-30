/**
 * Revenue Analytics Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RevenueAnalyticsService } from '@/services/analytics/revenueAnalytics';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    invoiceItem: {
      findMany: vi.fn(),
    },
    financialMetrics: {
      upsert: vi.fn(),
    },
  },
  withClinicContext: vi.fn((clinicId, callback) => callback()),
  getClinicContext: vi.fn(() => 1),
}));

describe('RevenueAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRevenueOverview', () => {
    it('should calculate revenue metrics correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      // Mock payment data
      (prisma.payment.findMany as any).mockResolvedValue([
        { amount: 10000, status: 'SUCCEEDED', fee: 290 },
        { amount: 20000, status: 'SUCCEEDED', fee: 580 },
        { amount: 15000, status: 'FAILED', fee: 0 },
      ]);

      (prisma.payment.aggregate as any).mockResolvedValue({
        _sum: { amount: 5000 },
      });

      const result = await RevenueAnalyticsService.getRevenueOverview(1, {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(result).toHaveProperty('grossRevenue');
      expect(result).toHaveProperty('netRevenue');
      expect(result).toHaveProperty('successfulPayments');
      expect(result).toHaveProperty('failedPayments');
      expect(result.successfulPayments).toBe(2);
      expect(result.failedPayments).toBe(1);
    });

    it('should handle empty payments', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.payment.findMany as any).mockResolvedValue([]);
      (prisma.payment.aggregate as any).mockResolvedValue({ _sum: { amount: 0 } });

      const result = await RevenueAnalyticsService.getRevenueOverview(1, {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(result.grossRevenue).toBe(0);
      expect(result.netRevenue).toBe(0);
      expect(result.averageOrderValue).toBe(0);
    });
  });

  describe('getMrrBreakdown', () => {
    it('should calculate MRR correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { id: 1, amount: 2990, interval: 'MONTHLY', createdAt: new Date(), canceledAt: null },
        { id: 2, amount: 4990, interval: 'MONTHLY', createdAt: new Date(), canceledAt: null },
      ]);

      const result = await RevenueAnalyticsService.getMrrBreakdown(1);

      expect(result).toHaveProperty('totalMrr');
      expect(result).toHaveProperty('activeSubscriptions');
      expect(result).toHaveProperty('arr');
      expect(result.activeSubscriptions).toBe(2);
      expect(result.totalMrr).toBe(7980); // 2990 + 4990
      expect(result.arr).toBe(7980 * 12);
    });

    it('should normalize different billing intervals to monthly', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { id: 1, amount: 11960, interval: 'QUARTERLY', createdAt: new Date(), canceledAt: null }, // ~3987/month
        { id: 2, amount: 2990, interval: 'MONTHLY', createdAt: new Date(), canceledAt: null },
      ]);

      const result = await RevenueAnalyticsService.getMrrBreakdown(1);

      // 11960 / 3 = 3987, + 2990 = ~6977
      expect(result.totalMrr).toBeGreaterThan(6900);
      expect(result.totalMrr).toBeLessThan(7000);
    });
  });

  describe('getRevenueTrends', () => {
    it('should group revenue by specified granularity', async () => {
      const { prisma } = await import('@/lib/db');
      
      const now = new Date();
      (prisma.payment.findMany as any).mockResolvedValue([
        { amount: 10000, status: 'SUCCEEDED', fee: 290, createdAt: now },
        { amount: 20000, status: 'SUCCEEDED', fee: 580, createdAt: now },
      ]);

      const result = await RevenueAnalyticsService.getRevenueTrends(
        1,
        { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: now },
        'daily'
      );

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('grossRevenue');
        expect(result[0]).toHaveProperty('netRevenue');
      }
    });
  });

  describe('getForecast', () => {
    it('should generate revenue forecast', async () => {
      const { prisma } = await import('@/lib/db');
      
      // Mock 12 months of historical data
      (prisma.payment.aggregate as any).mockResolvedValue({
        _sum: { amount: 50000 },
      });

      const result = await RevenueAnalyticsService.getForecast(1, 6);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(6);
      
      result.forEach((forecast, index) => {
        expect(forecast).toHaveProperty('month');
        expect(forecast).toHaveProperty('predictedRevenue');
        expect(forecast).toHaveProperty('confidence');
        expect(forecast).toHaveProperty('lowerBound');
        expect(forecast).toHaveProperty('upperBound');
        
        // Confidence should decrease over time
        if (index > 0) {
          expect(forecast.confidence).toBeLessThanOrEqual(result[index - 1].confidence);
        }
      });
    });
  });

  describe('getComparisonReport', () => {
    it('should calculate period comparison correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.payment.findMany as any).mockResolvedValue([
        { amount: 30000, status: 'SUCCEEDED', fee: 870 },
      ]);
      (prisma.payment.aggregate as any).mockResolvedValue({
        _sum: { amount: 0 },
      });

      const result = await RevenueAnalyticsService.getComparisonReport(
        1,
        { start: new Date('2024-02-01'), end: new Date('2024-02-29') },
        { start: new Date('2024-01-01'), end: new Date('2024-01-31') }
      );

      expect(result).toHaveProperty('currentPeriod');
      expect(result).toHaveProperty('previousPeriod');
      expect(result).toHaveProperty('changes');
      expect(result.changes).toHaveProperty('grossRevenue');
      expect(result.changes).toHaveProperty('netRevenue');
      expect(result.changes).toHaveProperty('paymentCount');
    });
  });
});
