/**
 * Subscription Domain Types
 *
 * @module domains/subscription/types
 */

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'past_due' | 'trialing';

export interface SubscriptionSummary {
  id: number;
  patientId: number;
  clinicId: number;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
  pausedAt: Date | null;
  createdAt: Date;
}

export interface CancelSubscriptionInput {
  subscriptionId: number;
  reason?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface PauseSubscriptionInput {
  subscriptionId: number;
  reason?: string;
}

export interface ResumeSubscriptionInput {
  subscriptionId: number;
}

export interface UserContext {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
}
