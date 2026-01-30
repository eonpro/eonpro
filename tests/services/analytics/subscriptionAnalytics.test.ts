/**
 * Subscription Analytics Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionAnalyticsService } from '@/services/analytics/subscriptionAnalytics';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    subscriptionAction: {
      findMany: vi.fn(),
    },
  },
  withClinicContext: vi.fn((clinicId, callback) => callback()),
  getClinicContext: vi.fn(() => 1),
}));

describe('SubscriptionAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSubscriptionMetrics', () => {
    it('should calculate subscription metrics correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { id: 1, status: 'ACTIVE', amount: 2990, interval: 'MONTHLY', planName: 'Basic' },
        { id: 2, status: 'ACTIVE', amount: 4990, interval: 'MONTHLY', planName: 'Premium' },
        { id: 3, status: 'PAUSED', amount: 2990, interval: 'MONTHLY', planName: 'Basic' },
        { id: 4, status: 'CANCELED', amount: 4990, interval: 'MONTHLY', planName: 'Premium' },
      ]);

      const result = await SubscriptionAnalyticsService.getSubscriptionMetrics(1);

      expect(result.activeSubscriptions).toBe(2);
      expect(result.pausedSubscriptions).toBe(1);
      expect(result.canceledSubscriptions).toBe(1);
      expect(result.totalMrr).toBe(7980); // Only active subscriptions
      expect(result.subscriptionsByPlan.length).toBe(2);
    });

    it('should normalize different billing intervals', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { id: 1, status: 'ACTIVE', amount: 2990, interval: 'MONTHLY', planName: 'Monthly' },
        { id: 2, status: 'ACTIVE', amount: 35880, interval: 'ANNUAL', planName: 'Annual' }, // 2990 * 12
      ]);

      const result = await SubscriptionAnalyticsService.getSubscriptionMetrics(1);

      // 2990 + (35880 / 12) = 2990 + 2990 = 5980
      expect(result.totalMrr).toBe(5980);
    });
  });

  describe('getChurnAnalysis', () => {
    it('should analyze churn correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      (prisma.subscription.findMany as any).mockResolvedValue([
        { 
          id: 1, 
          status: 'CANCELED', 
          amount: 2990, 
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: new Date(),
          cancelReason: 'Too expensive'
        },
      ]);

      (prisma.subscription.count as any).mockResolvedValue(10);

      const result = await SubscriptionAnalyticsService.getChurnAnalysis(1);

      expect(result).toHaveProperty('churnRate');
      expect(result).toHaveProperty('churnedCount');
      expect(result).toHaveProperty('churnedMrr');
      expect(result).toHaveProperty('churnReasons');
      expect(result).toHaveProperty('retentionRate');
      expect(result.churnedCount).toBe(1);
      expect(result.retentionRate + result.churnRate).toBe(100);
    });

    it('should group churn by reason', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { 
          id: 1, 
          status: 'CANCELED', 
          amount: 2990, 
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: new Date(),
          cancelReason: 'Too expensive'
        },
        { 
          id: 2, 
          status: 'CANCELED', 
          amount: 2990, 
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: new Date(),
          cancelReason: 'Too expensive'
        },
        { 
          id: 3, 
          status: 'CANCELED', 
          amount: 4990, 
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: new Date(),
          cancelReason: 'Not needed'
        },
      ]);

      (prisma.subscription.count as any).mockResolvedValue(10);

      const result = await SubscriptionAnalyticsService.getChurnAnalysis(1);

      expect(result.churnReasons.length).toBe(2);
      const expensiveReason = result.churnReasons.find(r => r.reason === 'Too expensive');
      expect(expensiveReason?.count).toBe(2);
    });
  });

  describe('getSubscriptionTrends', () => {
    it('should calculate monthly trends', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.count as any)
        .mockResolvedValue(5); // new subs
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        { id: 1, amount: 2990, interval: 'MONTHLY' },
      ]);

      const result = await SubscriptionAnalyticsService.getSubscriptionTrends(1, 3);

      expect(Array.isArray(result)).toBe(true);
      result.forEach(trend => {
        expect(trend).toHaveProperty('month');
        expect(trend).toHaveProperty('newSubscriptions');
        expect(trend).toHaveProperty('canceledSubscriptions');
        expect(trend).toHaveProperty('netChange');
        expect(trend).toHaveProperty('mrr');
      });
    });
  });

  describe('getSubscriptionDetails', () => {
    it('should return paginated subscription details', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        {
          id: 1,
          patientId: 1,
          planName: 'Basic',
          status: 'ACTIVE',
          amount: 2990,
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: null,
          cancelReason: null,
          patient: { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        },
      ]);

      (prisma.subscription.count as any).mockResolvedValue(1);

      const result = await SubscriptionAnalyticsService.getSubscriptionDetails(1, {
        page: 1,
        limit: 20,
      });

      expect(result).toHaveProperty('subscriptions');
      expect(result).toHaveProperty('total');
      expect(result.subscriptions[0]).toHaveProperty('patientName');
      expect(result.subscriptions[0]).toHaveProperty('daysSinceStart');
    });

    it('should filter by status', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([]);
      (prisma.subscription.count as any).mockResolvedValue(0);

      await SubscriptionAnalyticsService.getSubscriptionDetails(1, {
        status: 'PAUSED',
      });

      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PAUSED',
          }),
        })
      );
    });
  });

  describe('getPastDueSubscriptions', () => {
    it('should return past due subscriptions with breakdown', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.subscription.findMany as any).mockResolvedValue([
        {
          id: 1,
          patientId: 1,
          planName: 'Basic',
          status: 'PAST_DUE',
          amount: 2990,
          interval: 'MONTHLY',
          createdAt: new Date('2024-01-01'),
          canceledAt: null,
          cancelReason: null,
          patient: { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        },
      ]);

      const result = await SubscriptionAnalyticsService.getPastDueSubscriptions(1);

      expect(result).toHaveProperty('subscriptions');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('daysPastDue');
      expect(result.daysPastDue).toHaveProperty('under7');
      expect(result.daysPastDue).toHaveProperty('under30');
      expect(result.daysPastDue).toHaveProperty('over30');
    });
  });
});
