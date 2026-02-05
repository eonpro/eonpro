/**
 * PLATFORM FEE SERVICE
 * ====================
 * Manages per-clinic platform billing for EONPRO
 * 
 * Fee Types:
 * - PRESCRIPTION: Charged when EONPRO internal provider writes prescription
 * - TRANSMISSION: Charged when clinic's own provider uses platform to send to Lifefile
 * - ADMIN: Weekly platform usage fee (flat or percentage of sales)
 * 
 * Features:
 * - Fee configuration per clinic (set by super admin)
 * - Prescription cycle tracking (avoid double-charging within cycle period)
 * - Fee event recording and status management
 * - Fee aggregation for invoicing
 * 
 * @module services/billing/platformFeeService
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type {
  PlatformFeeType,
  PlatformFeeStatus,
  PlatformFeeCalculationType,
  PlatformAdminFeeType,
  ClinicPlatformFeeConfig,
  PlatformFeeEvent,
  PatientPrescriptionCycle,
} from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FeeConfigInput {
  prescriptionFeeType?: PlatformFeeCalculationType;
  prescriptionFeeAmount?: number;
  transmissionFeeType?: PlatformFeeCalculationType;
  transmissionFeeAmount?: number;
  adminFeeType?: PlatformAdminFeeType;
  adminFeeAmount?: number;
  prescriptionCycleDays?: number;
  billingEmail?: string;
  billingName?: string;
  billingAddress?: Record<string, unknown>;
  paymentTermsDays?: number;
  isActive?: boolean;
  notes?: string;
}

export interface FeeCalculationDetails {
  feeType: PlatformFeeType;
  calculationType: PlatformFeeCalculationType | PlatformAdminFeeType;
  rate: number;
  baseAmount?: number;
  orderTotalCents?: number;
  medicationKey?: string;
  isWithinCycle?: boolean;
  cycleInfo?: {
    lastChargedAt: Date;
    nextEligibleAt: Date;
  };
}

export interface FeeSummary {
  totalPrescriptionFees: number;
  totalTransmissionFees: number;
  totalAdminFees: number;
  totalAmountCents: number;
  prescriptionCount: number;
  transmissionCount: number;
  adminCount: number;
  pendingCount: number;
  invoicedCount: number;
  paidCount: number;
}

export interface FeeEventWithDetails extends PlatformFeeEvent {
  clinic: {
    id: number;
    name: string;
  };
  order?: {
    id: number;
    patientId: number;
    patient: {
      id: number;
      firstName: string;
      lastName: string;
    };
  } | null;
  provider?: {
    id: number;
    firstName: string;
    lastName: string;
    isEonproProvider: boolean;
  } | null;
}

// ============================================================================
// Platform Fee Service
// ============================================================================

export const platformFeeService = {
  // --------------------------------------------------------------------------
  // Fee Configuration Management
  // --------------------------------------------------------------------------

  /**
   * Get fee configuration for a clinic
   * Returns null if not configured
   */
  async getFeeConfig(clinicId: number): Promise<ClinicPlatformFeeConfig | null> {
    return prisma.clinicPlatformFeeConfig.findUnique({
      where: { clinicId },
    });
  },

  /**
   * Get or create fee configuration for a clinic
   * Creates with defaults if not exists
   */
  async getOrCreateFeeConfig(
    clinicId: number,
    actorId?: number
  ): Promise<ClinicPlatformFeeConfig> {
    const existing = await this.getFeeConfig(clinicId);
    if (existing) return existing;

    logger.info('[PlatformFeeService] Creating default fee config', { clinicId, actorId });

    return prisma.clinicPlatformFeeConfig.create({
      data: {
        clinicId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  },

  /**
   * Update fee configuration for a clinic
   */
  async updateFeeConfig(
    clinicId: number,
    input: FeeConfigInput,
    actorId?: number
  ): Promise<ClinicPlatformFeeConfig> {
    logger.info('[PlatformFeeService] Updating fee config', {
      clinicId,
      input,
      actorId,
    });

    // Validate percentage values if using percentage calculation
    if (input.prescriptionFeeType === 'PERCENTAGE' && input.prescriptionFeeAmount !== undefined) {
      if (input.prescriptionFeeAmount < 0 || input.prescriptionFeeAmount > 10000) {
        throw new Error('Prescription fee percentage must be between 0 and 100% (0-10000 basis points)');
      }
    }
    if (input.transmissionFeeType === 'PERCENTAGE' && input.transmissionFeeAmount !== undefined) {
      if (input.transmissionFeeAmount < 0 || input.transmissionFeeAmount > 10000) {
        throw new Error('Transmission fee percentage must be between 0 and 100% (0-10000 basis points)');
      }
    }
    if (input.adminFeeType === 'PERCENTAGE_WEEKLY' && input.adminFeeAmount !== undefined) {
      if (input.adminFeeAmount < 0 || input.adminFeeAmount > 10000) {
        throw new Error('Admin fee percentage must be between 0 and 100% (0-10000 basis points)');
      }
    }

    const existing = await this.getFeeConfig(clinicId);

    if (existing) {
      return prisma.clinicPlatformFeeConfig.update({
        where: { id: existing.id },
        data: {
          ...input,
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      });
    }

    return prisma.clinicPlatformFeeConfig.create({
      data: {
        clinicId,
        ...input,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  },

  /**
   * Get all fee configurations (for super admin)
   */
  async getAllFeeConfigs(): Promise<(ClinicPlatformFeeConfig & { clinic: { id: number; name: string } })[]> {
    return prisma.clinicPlatformFeeConfig.findMany({
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        clinic: {
          name: 'asc',
        },
      },
    });
  },

  // --------------------------------------------------------------------------
  // Prescription Cycle Management
  // --------------------------------------------------------------------------

  /**
   * Check if a prescription is eligible for billing based on cycle
   * Returns true if billable, false if within cycle period
   */
  async checkPrescriptionCycleEligibility(
    clinicId: number,
    patientId: number,
    medicationKey: string,
    cycleDays: number
  ): Promise<{ eligible: boolean; cycleInfo?: PatientPrescriptionCycle }> {
    const cycle = await prisma.patientPrescriptionCycle.findUnique({
      where: {
        clinicId_patientId_medicationKey: {
          clinicId,
          patientId,
          medicationKey,
        },
      },
    });

    if (!cycle) {
      // No previous cycle - eligible for billing
      return { eligible: true };
    }

    const now = new Date();
    if (now >= cycle.nextEligibleAt) {
      // Past the cycle period - eligible for billing
      return { eligible: true, cycleInfo: cycle };
    }

    // Within cycle period - not billable
    logger.debug('[PlatformFeeService] Prescription within cycle period', {
      clinicId,
      patientId,
      medicationKey,
      lastChargedAt: cycle.lastChargedAt,
      nextEligibleAt: cycle.nextEligibleAt,
    });

    return { eligible: false, cycleInfo: cycle };
  },

  /**
   * Update or create prescription cycle record
   */
  async updatePrescriptionCycle(
    clinicId: number,
    patientId: number,
    medicationKey: string,
    orderId: number,
    cycleDays: number
  ): Promise<PatientPrescriptionCycle> {
    const now = new Date();
    const nextEligibleAt = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000);

    return prisma.patientPrescriptionCycle.upsert({
      where: {
        clinicId_patientId_medicationKey: {
          clinicId,
          patientId,
          medicationKey,
        },
      },
      update: {
        lastChargedAt: now,
        lastOrderId: orderId,
        nextEligibleAt,
        updatedAt: now,
      },
      create: {
        clinicId,
        patientId,
        medicationKey,
        lastChargedAt: now,
        lastOrderId: orderId,
        nextEligibleAt,
      },
    });
  },

  /**
   * Normalize medication key for consistent cycle tracking
   * Format: lowercase, hyphen-separated (e.g., "semaglutide-2.5mg-vial")
   */
  normalizeMedicationKey(medName: string, strength?: string, form?: string): string {
    const parts = [medName];
    if (strength) parts.push(strength);
    if (form) parts.push(form);
    
    return parts
      .join('-')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  },

  // --------------------------------------------------------------------------
  // Fee Recording
  // --------------------------------------------------------------------------

  /**
   * Record a platform fee when prescription is created
   * Determines fee type (PRESCRIPTION vs TRANSMISSION) based on provider type
   */
  async recordPrescriptionFee(
    orderId: number,
    providerId: number
  ): Promise<PlatformFeeEvent | null> {
    // Get order with clinic, patient, and Rx info
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        rxs: {
          select: {
            id: true,
            medicationKey: true,
            medName: true,
            strength: true,
            form: true,
          },
        },
        invoice: {
          select: {
            id: true,
            amount: true,
            amountPaid: true,
          },
        },
      },
    });

    if (!order?.clinicId) {
      logger.debug('[PlatformFeeService] Order has no clinic, skipping fee', { orderId });
      return null;
    }

    // Get fee config for clinic
    const config = await this.getFeeConfig(order.clinicId);
    if (!config || !config.isActive) {
      logger.debug('[PlatformFeeService] Fee config not active for clinic', {
        orderId,
        clinicId: order.clinicId,
      });
      return null;
    }

    // Check if fee already exists for this order
    const existing = await prisma.platformFeeEvent.findUnique({
      where: { orderId },
    });

    if (existing) {
      logger.warn('[PlatformFeeService] Fee event already exists for order', {
        orderId,
        existingEventId: existing.id,
      });
      return existing;
    }

    // Get provider to determine fee type
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: {
        id: true,
        isEonproProvider: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!provider) {
      logger.error('[PlatformFeeService] Provider not found', { orderId, providerId });
      return null;
    }

    // Determine fee type based on provider
    const feeType: PlatformFeeType = provider.isEonproProvider ? 'PRESCRIPTION' : 'TRANSMISSION';
    const feeTypeConfig = provider.isEonproProvider
      ? { type: config.prescriptionFeeType, amount: config.prescriptionFeeAmount }
      : { type: config.transmissionFeeType, amount: config.transmissionFeeAmount };

    // Get primary medication for cycle checking
    const primaryRx = order.rxs[0];
    if (!primaryRx) {
      logger.warn('[PlatformFeeService] Order has no prescriptions', { orderId });
      return null;
    }

    const medicationKey = this.normalizeMedicationKey(
      primaryRx.medName,
      primaryRx.strength,
      primaryRx.form
    );

    // Check prescription cycle eligibility
    const { eligible, cycleInfo } = await this.checkPrescriptionCycleEligibility(
      order.clinicId,
      order.patientId,
      medicationKey,
      config.prescriptionCycleDays
    );

    if (!eligible) {
      logger.info('[PlatformFeeService] Prescription within cycle, no fee charged', {
        orderId,
        clinicId: order.clinicId,
        patientId: order.patientId,
        medicationKey,
        cycleInfo,
      });
      return null;
    }

    // Calculate fee amount
    const orderTotalCents = order.invoice?.amountPaid || order.invoice?.amount || null;
    const amountCents = this.calculateFeeAmount(
      feeTypeConfig.type,
      feeTypeConfig.amount,
      orderTotalCents
    );

    const calculationDetails: FeeCalculationDetails = {
      feeType,
      calculationType: feeTypeConfig.type,
      rate: feeTypeConfig.amount,
      orderTotalCents: orderTotalCents ?? undefined,
      medicationKey,
      isWithinCycle: false,
      cycleInfo: cycleInfo ? {
        lastChargedAt: cycleInfo.lastChargedAt,
        nextEligibleAt: cycleInfo.nextEligibleAt,
      } : undefined,
    };

    // Create fee event
    const feeEvent = await prisma.platformFeeEvent.create({
      data: {
        clinicId: order.clinicId,
        configId: config.id,
        feeType,
        orderId,
        providerId,
        patientId: order.patientId,
        amountCents,
        calculationDetails,
        status: 'PENDING',
      },
    });

    // Update prescription cycle
    await this.updatePrescriptionCycle(
      order.clinicId,
      order.patientId,
      medicationKey,
      orderId,
      config.prescriptionCycleDays
    );

    logger.info('[PlatformFeeService] Recorded prescription fee', {
      eventId: feeEvent.id,
      orderId,
      clinicId: order.clinicId,
      feeType,
      amountCents,
      providerType: provider.isEonproProvider ? 'EONPRO' : 'CLINIC',
    });

    return feeEvent;
  },

  /**
   * Record weekly admin fee for a clinic
   */
  async recordAdminFee(
    clinicId: number,
    weekStart: Date,
    weekEnd: Date,
    weeklySalesCents?: number
  ): Promise<PlatformFeeEvent | null> {
    const config = await this.getFeeConfig(clinicId);
    if (!config || !config.isActive || config.adminFeeType === 'NONE') {
      logger.debug('[PlatformFeeService] Admin fee not configured for clinic', { clinicId });
      return null;
    }

    // Check if admin fee already exists for this period
    const existing = await prisma.platformFeeEvent.findFirst({
      where: {
        clinicId,
        feeType: 'ADMIN',
        periodStart: weekStart,
        periodEnd: weekEnd,
      },
    });

    if (existing) {
      logger.warn('[PlatformFeeService] Admin fee already exists for period', {
        clinicId,
        weekStart,
        weekEnd,
        existingEventId: existing.id,
      });
      return existing;
    }

    // Calculate weekly sales if needed and not provided
    let salesCents = weeklySalesCents;
    if (config.adminFeeType === 'PERCENTAGE_WEEKLY' && salesCents === undefined) {
      salesCents = await this.calculateWeeklySales(clinicId, weekStart, weekEnd);
    }

    // Calculate admin fee amount
    let amountCents: number;
    if (config.adminFeeType === 'FLAT_WEEKLY') {
      amountCents = config.adminFeeAmount;
    } else if (config.adminFeeType === 'PERCENTAGE_WEEKLY' && salesCents !== undefined) {
      // adminFeeAmount is in basis points (100 = 1%)
      amountCents = Math.round((salesCents * config.adminFeeAmount) / 10000);
    } else {
      logger.warn('[PlatformFeeService] Cannot calculate admin fee', {
        clinicId,
        adminFeeType: config.adminFeeType,
        salesCents,
      });
      return null;
    }

    // Skip zero fees
    if (amountCents <= 0) {
      logger.debug('[PlatformFeeService] Admin fee is zero, skipping', { clinicId, amountCents });
      return null;
    }

    const calculationDetails: FeeCalculationDetails = {
      feeType: 'ADMIN',
      calculationType: config.adminFeeType,
      rate: config.adminFeeAmount,
      baseAmount: salesCents,
    };

    const feeEvent = await prisma.platformFeeEvent.create({
      data: {
        clinicId,
        configId: config.id,
        feeType: 'ADMIN',
        periodStart: weekStart,
        periodEnd: weekEnd,
        periodSales: salesCents,
        amountCents,
        calculationDetails,
        status: 'PENDING',
      },
    });

    logger.info('[PlatformFeeService] Recorded admin fee', {
      eventId: feeEvent.id,
      clinicId,
      weekStart,
      weekEnd,
      amountCents,
      salesCents,
      adminFeeType: config.adminFeeType,
    });

    return feeEvent;
  },

  /**
   * Calculate weekly sales for a clinic (for percentage-based admin fees)
   */
  async calculateWeeklySales(
    clinicId: number,
    weekStart: Date,
    weekEnd: Date
  ): Promise<number> {
    const result = await prisma.payment.aggregate({
      where: {
        clinicId,
        status: 'COMPLETED',
        createdAt: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      _sum: {
        amountCents: true,
      },
    });

    return result._sum.amountCents || 0;
  },

  /**
   * Calculate fee amount based on calculation type
   */
  calculateFeeAmount(
    calculationType: PlatformFeeCalculationType,
    rate: number,
    orderTotalCents: number | null
  ): number {
    if (calculationType === 'FLAT') {
      return rate;
    }

    if (calculationType === 'PERCENTAGE' && orderTotalCents) {
      // rate is in basis points (100 = 1%)
      return Math.round((orderTotalCents * rate) / 10000);
    }

    // Fallback to flat rate if no order total for percentage
    if (calculationType === 'PERCENTAGE' && !orderTotalCents) {
      logger.warn('[PlatformFeeService] No order total for percentage calculation, using rate as flat');
      return rate;
    }

    return rate;
  },

  // --------------------------------------------------------------------------
  // Fee Status Management
  // --------------------------------------------------------------------------

  /**
   * Void a fee event (e.g., when order is cancelled)
   */
  async voidFee(
    feeEventId: number,
    reason: string,
    actorId?: number
  ): Promise<PlatformFeeEvent | null> {
    const event = await prisma.platformFeeEvent.findUnique({
      where: { id: feeEventId },
    });

    if (!event) {
      logger.warn('[PlatformFeeService] Fee event not found', { feeEventId });
      return null;
    }

    if (event.status === 'VOIDED') {
      logger.debug('[PlatformFeeService] Fee already voided', { feeEventId });
      return event;
    }

    if (event.status === 'PAID') {
      logger.warn('[PlatformFeeService] Cannot void paid fee', { feeEventId });
      throw new Error('Cannot void a fee that has already been paid');
    }

    const updated = await prisma.platformFeeEvent.update({
      where: { id: feeEventId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedBy: actorId,
        voidedReason: reason,
      },
    });

    logger.info('[PlatformFeeService] Voided fee event', {
      feeEventId,
      reason,
      actorId,
    });

    return updated;
  },

  /**
   * Void fee by order ID (helper for order cancellation)
   */
  async voidFeeByOrder(
    orderId: number,
    reason: string,
    actorId?: number
  ): Promise<PlatformFeeEvent | null> {
    const event = await prisma.platformFeeEvent.findUnique({
      where: { orderId },
    });

    if (!event) {
      logger.debug('[PlatformFeeService] No fee event for order', { orderId });
      return null;
    }

    return this.voidFee(event.id, reason, actorId);
  },

  /**
   * Waive a fee event (manual admin action)
   */
  async waiveFee(
    feeEventId: number,
    reason: string,
    actorId: number
  ): Promise<PlatformFeeEvent> {
    const event = await prisma.platformFeeEvent.findUnique({
      where: { id: feeEventId },
    });

    if (!event) {
      throw new Error('Fee event not found');
    }

    if (event.status !== 'PENDING') {
      throw new Error(`Cannot waive fee with status: ${event.status}`);
    }

    const updated = await prisma.platformFeeEvent.update({
      where: { id: feeEventId },
      data: {
        status: 'WAIVED',
        waivedAt: new Date(),
        waivedBy: actorId,
        waivedReason: reason,
      },
    });

    logger.info('[PlatformFeeService] Waived fee event', {
      feeEventId,
      reason,
      actorId,
    });

    return updated;
  },

  // --------------------------------------------------------------------------
  // Fee Queries
  // --------------------------------------------------------------------------

  /**
   * Get fee events for a clinic
   */
  async getClinicFeeEvents(
    clinicId: number,
    options: {
      status?: PlatformFeeStatus;
      feeType?: PlatformFeeType;
      startDate?: Date;
      endDate?: Date;
      includeInvoiced?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ events: FeeEventWithDetails[]; total: number }> {
    const where: Record<string, unknown> = {
      clinicId,
    };

    if (options.status) {
      where.status = options.status;
    } else if (!options.includeInvoiced) {
      // By default, exclude invoiced fees
      where.status = { in: ['PENDING', 'WAIVED', 'VOIDED'] };
    }

    if (options.feeType) {
      where.feeType = options.feeType;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) (where.createdAt as Record<string, Date>).gte = options.startDate;
      if (options.endDate) (where.createdAt as Record<string, Date>).lte = options.endDate;
    }

    const [events, total] = await Promise.all([
      prisma.platformFeeEvent.findMany({
        where,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              patientId: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              isEonproProvider: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 50,
        skip: options.offset ?? 0,
      }),
      prisma.platformFeeEvent.count({ where }),
    ]);

    return { events: events as FeeEventWithDetails[], total };
  },

  /**
   * Get pending fees for a clinic (ready for invoicing)
   */
  async getPendingFees(
    clinicId: number,
    dateRange?: DateRange
  ): Promise<PlatformFeeEvent[]> {
    const where: Record<string, unknown> = {
      clinicId,
      status: 'PENDING',
    };

    if (dateRange) {
      where.createdAt = {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      };
    }

    return prisma.platformFeeEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Get fee summary for a clinic
   */
  async getFeeSummary(
    clinicId: number,
    dateRange?: DateRange
  ): Promise<FeeSummary> {
    const where: Record<string, unknown> = {
      clinicId,
    };

    if (dateRange) {
      where.createdAt = {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      };
    }

    const events = await prisma.platformFeeEvent.findMany({
      where,
      select: {
        feeType: true,
        amountCents: true,
        status: true,
      },
    });

    let totalPrescriptionFees = 0;
    let totalTransmissionFees = 0;
    let totalAdminFees = 0;
    let prescriptionCount = 0;
    let transmissionCount = 0;
    let adminCount = 0;
    let pendingCount = 0;
    let invoicedCount = 0;
    let paidCount = 0;

    for (const event of events) {
      // Skip voided and waived fees from totals
      if (event.status === 'VOIDED' || event.status === 'WAIVED') continue;

      switch (event.feeType) {
        case 'PRESCRIPTION':
          totalPrescriptionFees += event.amountCents;
          prescriptionCount++;
          break;
        case 'TRANSMISSION':
          totalTransmissionFees += event.amountCents;
          transmissionCount++;
          break;
        case 'ADMIN':
          totalAdminFees += event.amountCents;
          adminCount++;
          break;
      }

      switch (event.status) {
        case 'PENDING':
          pendingCount++;
          break;
        case 'INVOICED':
          invoicedCount++;
          break;
        case 'PAID':
          paidCount++;
          break;
      }
    }

    return {
      totalPrescriptionFees,
      totalTransmissionFees,
      totalAdminFees,
      totalAmountCents: totalPrescriptionFees + totalTransmissionFees + totalAdminFees,
      prescriptionCount,
      transmissionCount,
      adminCount,
      pendingCount,
      invoicedCount,
      paidCount,
    };
  },

  // --------------------------------------------------------------------------
  // Utility Functions
  // --------------------------------------------------------------------------

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

  /**
   * Get the start of the current/previous week (Sunday)
   */
  getWeekStart(date: Date = new Date(), offset: number = 0): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay() + (offset * 7));
    d.setHours(0, 0, 0, 0);
    return d;
  },

  /**
   * Get the end of the current/previous week (Saturday)
   */
  getWeekEnd(date: Date = new Date(), offset: number = 0): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay() + 6 + (offset * 7));
    d.setHours(23, 59, 59, 999);
    return d;
  },
};

export type PlatformFeeService = typeof platformFeeService;
