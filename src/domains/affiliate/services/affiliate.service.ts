/**
 * Affiliate Service
 *
 * @module domains/affiliate/services
 */

import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AffiliateService {
  getById(id: number): Promise<Record<string, unknown> | null>;
  getByUserId(userId: number): Promise<Record<string, unknown> | null>;
  listCommissions(affiliateId: number, options?: { limit?: number; offset?: number }): Promise<Record<string, unknown>[]>;
  getDashboardStats(affiliateId: number): Promise<Record<string, unknown>>;
}

export function createAffiliateService(): AffiliateService {
  return {
    async getById(id: number) {
      const affiliate = await basePrisma.affiliate.findUnique({ where: { id } });
      return affiliate as unknown as Record<string, unknown> | null;
    },

    async getByUserId(userId: number) {
      const affiliate = await basePrisma.affiliate.findFirst({ where: { userId } });
      return affiliate as unknown as Record<string, unknown> | null;
    },

    async listCommissions(affiliateId: number, options = {}) {
      const limit = Math.min(options.limit ?? 50, 500);
      const offset = options.offset ?? 0;

      const commissions = await basePrisma.affiliateCommissionEvent.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
      return commissions as unknown as Record<string, unknown>[];
    },

    async getDashboardStats(affiliateId: number) {
      const [totalCommissions, pendingPayouts, totalReferrals] = await Promise.all([
        basePrisma.affiliateCommissionEvent.aggregate({
          where: { affiliateId },
          _sum: { amountCents: true },
        }),
        basePrisma.affiliatePayout.count({
          where: { affiliateId, status: 'PENDING' },
        }),
        basePrisma.affiliateReferral.count({
          where: { affiliateId },
        }),
      ]);

      return {
        totalCommissionsCents: totalCommissions._sum.amountCents ?? 0,
        pendingPayouts,
        totalReferrals,
      };
    },
  };
}

export const affiliateService = createAffiliateService();
