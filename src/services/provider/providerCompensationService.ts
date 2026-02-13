/**
 * Provider Compensation Service
 * =============================
 *
 * Enterprise feature for tracking per-script provider compensation.
 * Handles earnings recording, calculation, reporting, and (future) payout integration.
 *
 * @module services/provider/providerCompensationService
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
  CompensationEventStatus,
  CompensationType,
  ProviderCompensationPlan,
  ProviderCompensationEvent,
} from '@prisma/client';
import { providerRoutingService } from './providerRoutingService';

// ============================================================================
// Types
// ============================================================================

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface EarningsSummary {
  totalPrescriptions: number;
  totalEarningsCents: number;
  pendingEarningsCents: number;
  approvedEarningsCents: number;
  paidEarningsCents: number;
  voidedCount: number;
  breakdown: {
    period: string;
    prescriptions: number;
    earningsCents: number;
  }[];
}

export interface CompensationPlanWithProvider {
  id: number;
  clinicId: number;
  providerId: number;
  compensationType: CompensationType;
  flatRatePerScript: number;
  percentBps: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  notes: string | null;
  provider: {
    id: number;
    firstName: string;
    lastName: string;
    npi: string;
    email: string | null;
  };
}

export interface CompensationPlanInput {
  compensationType: CompensationType;
  flatRatePerScript?: number;
  percentBps?: number;
  notes?: string;
}

export interface CalculationDetails {
  compensationType: CompensationType;
  flatAmount: number;
  percentAmount: number;
  percentBps: number;
  orderTotalCents: number | null;
  prescriptionCount: number;
}

export interface CompensationEventWithDetails {
  id: number;
  clinicId: number;
  providerId: number;
  orderId: number;
  planId: number;
  amountCents: number;
  prescriptionCount: number;
  status: CompensationEventStatus;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  provider: {
    id: number;
    firstName: string;
    lastName: string;
  };
  order: {
    id: number;
    patientId: number;
    primaryMedName: string | null;
    patient: {
      firstName: string;
      lastName: string;
    };
  };
}

// ============================================================================
// Provider Compensation Service
// ============================================================================

export const providerCompensationService = {
  // --------------------------------------------------------------------------
  // Compensation Plan Management
  // --------------------------------------------------------------------------

  /**
   * Get compensation plan for a provider at a clinic
   */
  async getCompensationPlan(
    clinicId: number,
    providerId: number
  ): Promise<ProviderCompensationPlan | null> {
    return prisma.providerCompensationPlan.findUnique({
      where: {
        clinicId_providerId: {
          clinicId,
          providerId,
        },
      },
    });
  },

  /**
   * Get all compensation plans for a clinic
   */
  async getClinicCompensationPlans(clinicId: number): Promise<CompensationPlanWithProvider[]> {
    const plans = await prisma.providerCompensationPlan.findMany({
      where: { clinicId },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            npi: true,
            email: true,
          },
        },
      },
      orderBy: {
        provider: {
          lastName: 'asc',
        },
      },
    });

    return plans;
  },

  /**
   * Create or update compensation plan for a provider
   */
  async upsertCompensationPlan(
    clinicId: number,
    providerId: number,
    input: CompensationPlanInput,
    actorId?: number
  ): Promise<ProviderCompensationPlan> {
    // Check if routing/compensation is enabled for this clinic
    const config = await providerRoutingService.getRoutingConfig(clinicId);
    if (config && !config.compensationEnabled) {
      logger.warn('[ProviderCompensationService] Compensation not enabled for clinic', {
        clinicId,
      });
    }

    const { compensationType, flatRatePerScript, percentBps, notes } = input;

    // Validate input based on compensation type
    if (compensationType === 'FLAT_RATE' || compensationType === 'HYBRID') {
      if (flatRatePerScript === undefined || flatRatePerScript < 0) {
        throw new Error('Flat rate is required for FLAT_RATE or HYBRID compensation types');
      }
    }

    if (compensationType === 'PERCENTAGE' || compensationType === 'HYBRID') {
      if (percentBps === undefined || percentBps < 0 || percentBps > 10000) {
        throw new Error(
          'Percentage (0-100%) is required for PERCENTAGE or HYBRID compensation types'
        );
      }
    }

    logger.info('[ProviderCompensationService] upsertCompensationPlan', {
      clinicId,
      providerId,
      compensationType,
      flatRatePerScript,
      percentBps,
      actorId,
    });

    const existing = await this.getCompensationPlan(clinicId, providerId);

    const data = {
      compensationType,
      flatRatePerScript: flatRatePerScript ?? 0,
      percentBps: percentBps ?? 0,
      createdBy: actorId,
      notes,
      updatedAt: new Date(),
    };

    if (existing) {
      return prisma.providerCompensationPlan.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.providerCompensationPlan.create({
      data: {
        clinicId,
        providerId,
        ...data,
      },
    });
  },

  /**
   * Deactivate a compensation plan
   */
  async deactivatePlan(planId: number): Promise<ProviderCompensationPlan> {
    return prisma.providerCompensationPlan.update({
      where: { id: planId },
      data: {
        isActive: false,
        effectiveTo: new Date(),
      },
    });
  },

  // --------------------------------------------------------------------------
  // Compensation Event Recording
  // --------------------------------------------------------------------------

  /**
   * Record compensation event when a prescription is created
   * Called after successful prescription creation
   */
  async recordPrescription(
    orderId: number,
    providerId: number,
    metadata?: Record<string, unknown>
  ): Promise<ProviderCompensationEvent | null> {
    // Get the order with rxs for prescription count
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clinicId: true,
        rxs: {
          select: { id: true },
        },
      },
    });

    // Get invoice separately (Invoice -> Order, not Order -> Invoice)
    const invoice = await prisma.invoice.findFirst({
      where: { orderId },
      select: {
        id: true,
        amount: true,
        amountPaid: true,
      },
    });

    if (!order?.clinicId) {
      logger.debug('[ProviderCompensationService] Order has no clinic, skipping compensation', {
        orderId,
      });
      return null;
    }

    // Check if compensation is enabled for this clinic
    const config = await providerRoutingService.getRoutingConfig(order.clinicId);
    if (!config?.compensationEnabled) {
      logger.debug('[ProviderCompensationService] Compensation not enabled for clinic', {
        orderId,
        clinicId: order.clinicId,
      });
      return null;
    }

    // Get compensation plan for this provider
    const plan = await this.getCompensationPlan(order.clinicId, providerId);
    if (!plan || !plan.isActive) {
      logger.debug('[ProviderCompensationService] No active compensation plan for provider', {
        orderId,
        providerId,
        clinicId: order.clinicId,
      });
      return null;
    }

    // Check if compensation event already exists for this order
    const existing = await prisma.providerCompensationEvent.findUnique({
      where: { orderId },
    });

    if (existing) {
      logger.warn('[ProviderCompensationService] Compensation event already exists', {
        orderId,
        existingEventId: existing.id,
      });
      return existing;
    }

    // Calculate compensation based on type
    const prescriptionCount = order.rxs?.length || 1;
    const orderTotalCents = invoice?.amountPaid || invoice?.amount || null;

    const { amountCents, calculationDetails } = this.calculateCompensation(
      plan,
      prescriptionCount,
      orderTotalCents
    );

    // Create compensation event
    const event = await prisma.providerCompensationEvent.create({
      data: {
        clinicId: order.clinicId,
        providerId,
        orderId,
        planId: plan.id,
        amountCents,
        prescriptionCount,
        orderTotalCents,
        calculationDetails: calculationDetails as any,
        status: 'PENDING',
        metadata: (metadata ?? undefined) as any,
      },
    });

    logger.info('[ProviderCompensationService] Recorded compensation event', {
      eventId: event.id,
      orderId,
      providerId,
      compensationType: plan.compensationType,
      amountCents,
      prescriptionCount,
      orderTotalCents,
    });

    return event;
  },

  /**
   * Calculate compensation amount based on plan type
   */
  calculateCompensation(
    plan: ProviderCompensationPlan,
    prescriptionCount: number,
    orderTotalCents: number | null
  ): { amountCents: number; calculationDetails: CalculationDetails } {
    let flatAmount = 0;
    let percentAmount = 0;

    // Calculate flat rate component
    if (plan.compensationType === 'FLAT_RATE' || plan.compensationType === 'HYBRID') {
      flatAmount = plan.flatRatePerScript * prescriptionCount;
    }

    // Calculate percentage component
    if (plan.compensationType === 'PERCENTAGE' || plan.compensationType === 'HYBRID') {
      if (orderTotalCents && plan.percentBps > 0) {
        // percentBps is in basis points (100 = 1%, 1000 = 10%)
        percentAmount = Math.round((orderTotalCents * plan.percentBps) / 10000);
      } else if (!orderTotalCents && plan.compensationType === 'PERCENTAGE') {
        logger.warn('[ProviderCompensationService] No order total for percentage calculation', {
          compensationType: plan.compensationType,
          percentBps: plan.percentBps,
        });
      }
    }

    const amountCents = flatAmount + percentAmount;

    const calculationDetails: CalculationDetails = {
      compensationType: plan.compensationType,
      flatAmount,
      percentAmount,
      percentBps: plan.percentBps,
      orderTotalCents,
      prescriptionCount,
    };

    return { amountCents, calculationDetails };
  },

  /**
   * Void compensation for a cancelled order
   */
  async voidCompensation(orderId: number, reason: string, actorId?: number): Promise<void> {
    const event = await prisma.providerCompensationEvent.findUnique({
      where: { orderId },
    });

    if (!event) {
      logger.debug('[ProviderCompensationService] No compensation event to void', { orderId });
      return;
    }

    if (event.status === 'VOIDED') {
      logger.debug('[ProviderCompensationService] Event already voided', { orderId });
      return;
    }

    if (event.status === 'PAID') {
      logger.warn('[ProviderCompensationService] Cannot void paid compensation', {
        orderId,
        eventId: event.id,
      });
      throw new Error('Cannot void a compensation event that has already been paid');
    }

    await prisma.providerCompensationEvent.update({
      where: { id: event.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedBy: actorId,
        voidedReason: reason,
      },
    });

    logger.info('[ProviderCompensationService] Voided compensation event', {
      eventId: event.id,
      orderId,
      reason,
      actorId,
    });
  },

  /**
   * Approve compensation events for payout
   */
  async approveCompensation(eventIds: number[], actorId: number): Promise<number> {
    const result = await prisma.providerCompensationEvent.updateMany({
      where: {
        id: { in: eventIds },
        status: 'PENDING',
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: actorId,
      },
    });

    logger.info('[ProviderCompensationService] Approved compensation events', {
      count: result.count,
      eventIds,
      actorId,
    });

    return result.count;
  },

  /**
   * Mark compensation events as paid (for future payment integration)
   */
  async markAsPaid(
    eventIds: number[],
    payoutReference: string,
    payoutBatchId?: string
  ): Promise<number> {
    const result = await prisma.providerCompensationEvent.updateMany({
      where: {
        id: { in: eventIds },
        status: { in: ['PENDING', 'APPROVED'] },
      },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        payoutReference,
        payoutBatchId,
      },
    });

    logger.info('[ProviderCompensationService] Marked compensation as paid', {
      count: result.count,
      eventIds,
      payoutReference,
      payoutBatchId,
    });

    return result.count;
  },

  // --------------------------------------------------------------------------
  // Earnings Queries
  // --------------------------------------------------------------------------

  /**
   * Get provider's earnings summary
   */
  async getProviderEarnings(
    providerId: number,
    dateRange: DateRange,
    clinicId?: number
  ): Promise<EarningsSummary> {
    const where: {
      providerId: number;
      clinicId?: number;
      createdAt: {
        gte: Date;
        lte: Date;
      };
    } = {
      providerId,
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    };

    if (clinicId) {
      where.clinicId = clinicId;
    }

    const events = await prisma.providerCompensationEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // Calculate totals by status
    let totalPrescriptions = 0;
    let totalEarningsCents = 0;
    let pendingEarningsCents = 0;
    let approvedEarningsCents = 0;
    let paidEarningsCents = 0;
    let voidedCount = 0;

    // Group by day for breakdown
    const breakdownMap = new Map<string, { prescriptions: number; earningsCents: number }>();

    for (const event of events) {
      if (event.status === 'VOIDED') {
        voidedCount++;
        continue;
      }

      totalPrescriptions += event.prescriptionCount;
      totalEarningsCents += event.amountCents;

      switch (event.status) {
        case 'PENDING':
          pendingEarningsCents += event.amountCents;
          break;
        case 'APPROVED':
          approvedEarningsCents += event.amountCents;
          break;
        case 'PAID':
          paidEarningsCents += event.amountCents;
          break;
      }

      // Add to daily breakdown
      const dayKey = event.createdAt.toISOString().split('T')[0];
      const existing = breakdownMap.get(dayKey) || { prescriptions: 0, earningsCents: 0 };
      existing.prescriptions += event.prescriptionCount;
      existing.earningsCents += event.amountCents;
      breakdownMap.set(dayKey, existing);
    }

    // Convert breakdown map to sorted array
    const breakdown = Array.from(breakdownMap.entries())
      .map(([period, data]) => ({
        period,
        prescriptions: data.prescriptions,
        earningsCents: data.earningsCents,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return {
      totalPrescriptions,
      totalEarningsCents,
      pendingEarningsCents,
      approvedEarningsCents,
      paidEarningsCents,
      voidedCount,
      breakdown,
    };
  },

  /**
   * Get compensation events for a clinic (admin view)
   */
  async getClinicCompensationEvents(
    clinicId: number,
    options: {
      providerId?: number;
      status?: CompensationEventStatus;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    events: CompensationEventWithDetails[];
    total: number;
  }> {
    const where: {
      clinicId: number;
      providerId?: number;
      status?: CompensationEventStatus;
      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    } = {
      clinicId,
    };

    if (options.providerId) {
      where.providerId = options.providerId;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [events, total] = await Promise.all([
      prisma.providerCompensationEvent.findMany({
        where,
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          order: {
            select: {
              id: true,
              patientId: true,
              primaryMedName: true,
              patient: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
      }),
      prisma.providerCompensationEvent.count({ where }),
    ]);

    return { events, total };
  },

  // --------------------------------------------------------------------------
  // Reporting
  // --------------------------------------------------------------------------

  /**
   * Get provider performance report data
   */
  async getProviderPerformanceReport(
    clinicId: number,
    dateRange: DateRange,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    summary: {
      totalPrescriptions: number;
      totalSOAPNotes: number;
      totalEarningsCents: number;
      providerCount: number;
    };
    providers: {
      id: number;
      name: string;
      prescriptions: number;
      soapNotes: number;
      earningsCents: number;
    }[];
    timeline: {
      period: string;
      prescriptions: number;
      soapNotes: number;
    }[];
  }> {
    // Get all compensation events in range
    const events = await prisma.providerCompensationEvent.findMany({
      where: {
        clinicId,
        status: { not: 'VOIDED' },
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Get SOAP notes in range
    const soapNotes = await prisma.sOAPNote.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        id: true,
        approvedBy: true,
        createdAt: true,
      },
    });

    // Calculate summary
    const providerMap = new Map<
      number,
      {
        name: string;
        prescriptions: number;
        soapNotes: number;
        earningsCents: number;
      }
    >();

    for (const event of events) {
      const existing = providerMap.get(event.providerId) || {
        name: `${event.provider.firstName} ${event.provider.lastName}`,
        prescriptions: 0,
        soapNotes: 0,
        earningsCents: 0,
      };
      existing.prescriptions += event.prescriptionCount;
      existing.earningsCents += event.amountCents;
      providerMap.set(event.providerId, existing);
    }

    // Add SOAP note counts
    for (const note of soapNotes) {
      if (note.approvedBy) {
        const existing = providerMap.get(note.approvedBy);
        if (existing) {
          existing.soapNotes++;
        }
      }
    }

    // Build timeline
    const timelineMap = new Map<string, { prescriptions: number; soapNotes: number }>();

    const getPeriodKey = (date: Date): string => {
      switch (groupBy) {
        case 'day':
          return date.toISOString().split('T')[0];
        case 'week': {
          const d = new Date(date);
          d.setDate(d.getDate() - d.getDay());
          return d.toISOString().split('T')[0];
        }
        case 'month':
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    for (const event of events) {
      const key = getPeriodKey(event.createdAt);
      const existing = timelineMap.get(key) || { prescriptions: 0, soapNotes: 0 };
      existing.prescriptions += event.prescriptionCount;
      timelineMap.set(key, existing);
    }

    for (const note of soapNotes) {
      const key = getPeriodKey(note.createdAt);
      const existing = timelineMap.get(key) || { prescriptions: 0, soapNotes: 0 };
      existing.soapNotes++;
      timelineMap.set(key, existing);
    }

    const providers = Array.from(providerMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.prescriptions - a.prescriptions);

    const timeline = Array.from(timelineMap.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    const summary = {
      totalPrescriptions: events.reduce(
        (sum: number, e: (typeof events)[0]) => sum + e.prescriptionCount,
        0
      ),
      totalSOAPNotes: soapNotes.length,
      totalEarningsCents: events.reduce(
        (sum: number, e: (typeof events)[0]) => sum + e.amountCents,
        0
      ),
      providerCount: providerMap.size,
    };

    return {
      summary,
      providers,
      timeline,
    };
  },

  /**
   * Get date range helper for common periods
   */
  getDateRange(period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd'): DateRange {
    const now = new Date();
    const startDate = new Date();
    const endDate = new Date();

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate.setMonth(currentQuarter * 3, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'year':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'ytd':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    return { startDate, endDate };
  },
};

export type ProviderCompensationService = typeof providerCompensationService;
