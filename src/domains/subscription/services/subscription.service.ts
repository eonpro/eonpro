/**
 * Subscription Service
 * ====================
 *
 * Business logic for subscription lifecycle management.
 * Handles cancel, pause, resume operations with Stripe integration.
 *
 * @module domains/subscription/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
  CancelSubscriptionInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
  SubscriptionSummary,
  UserContext,
} from '../types';

export interface SubscriptionService {
  getById(id: number, user: UserContext): Promise<SubscriptionSummary | null>;
  cancel(input: CancelSubscriptionInput, user: UserContext): Promise<SubscriptionSummary>;
  pause(input: PauseSubscriptionInput, user: UserContext): Promise<SubscriptionSummary>;
  resume(input: ResumeSubscriptionInput, user: UserContext): Promise<SubscriptionSummary>;
}

export function createSubscriptionService(): SubscriptionService {
  return {
    async getById(id: number, user: UserContext): Promise<SubscriptionSummary | null> {
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return null;
      if (user.role !== 'super_admin' && sub.clinicId !== user.clinicId) return null;
      return mapToSummary(sub);
    },

    async cancel(input: CancelSubscriptionInput, user: UserContext): Promise<SubscriptionSummary> {
      const sub = await prisma.subscription.findUnique({ where: { id: input.subscriptionId } });
      if (!sub) throw new Error('Subscription not found');

      // Cancel in Stripe first
      if (sub.stripeSubscriptionId) {
        try {
          const stripe = (await import('@/lib/stripe')).requireStripeClient();
          await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            cancel_at_period_end: input.cancelAtPeriodEnd ?? true,
          });
        } catch (err) {
          logger.error('[SubscriptionService] Stripe cancel failed', {
            subscriptionId: sub.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
          throw err;
        }
      }

      // Update DB in transaction
      const updated = await prisma.$transaction(async (tx: any) => {
        const result = await tx.subscription.update({
          where: { id: input.subscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: input.reason ?? null,
          },
        });

        await tx.subscriptionAction.create({
          data: {
            subscriptionId: input.subscriptionId,
            action: 'CANCEL',
            performedBy: user.id,
            reason: input.reason ?? null,
          },
        });

        return result;
      });

      return mapToSummary(updated);
    },

    async pause(input: PauseSubscriptionInput, user: UserContext): Promise<SubscriptionSummary> {
      const updated = await prisma.$transaction(async (tx: any) => {
        const result = await tx.subscription.update({
          where: { id: input.subscriptionId },
          data: {
            status: 'paused',
            pausedAt: new Date(),
          },
        });

        await tx.subscriptionAction.create({
          data: {
            subscriptionId: input.subscriptionId,
            action: 'PAUSE',
            performedBy: user.id,
            reason: input.reason ?? null,
          },
        });

        return result;
      });

      return mapToSummary(updated);
    },

    async resume(input: ResumeSubscriptionInput, user: UserContext): Promise<SubscriptionSummary> {
      const updated = await prisma.$transaction(async (tx: any) => {
        const result = await tx.subscription.update({
          where: { id: input.subscriptionId },
          data: {
            status: 'active',
            pausedAt: null,
          },
        });

        await tx.subscriptionAction.create({
          data: {
            subscriptionId: input.subscriptionId,
            action: 'RESUME',
            performedBy: user.id,
          },
        });

        return result;
      });

      return mapToSummary(updated);
    },
  };
}

function mapToSummary(sub: any): SubscriptionSummary {
  return {
    id: sub.id,
    patientId: sub.patientId,
    clinicId: sub.clinicId,
    status: sub.status,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelledAt: sub.cancelledAt,
    pausedAt: sub.pausedAt,
    createdAt: sub.createdAt,
  };
}

export const subscriptionService = createSubscriptionService();
