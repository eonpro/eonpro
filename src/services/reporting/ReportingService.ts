/**
 * COMPREHENSIVE REPORTING SERVICE
 * ================================
 * Enterprise-grade reporting for clinic management
 * 
 * Features:
 * - Patient metrics (new, active, churned)
 * - Revenue analytics (daily, weekly, monthly, quarterly, yearly, custom)
 * - Subscription tracking (recurring revenue, treatment months, cancellations)
 * - Payment history and forecasting
 * - Treatment progression tracking
 * 
 * @module services/reporting
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';
import { getClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';

// Use direct Prisma client for reporting (bypasses clinic filter for super admin)
const prisma = new PrismaClient();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DateRange = 
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_semester'
  | 'last_semester'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface DateRangeParams {
  range: DateRange;
  startDate?: Date;
  endDate?: Date;
}

export interface PatientMetrics {
  totalPatients: number;
  newPatients: number;
  activePatients: number;
  inactivePatients: number;
  patientsBySource: Record<string, number>;
  patientsByGender: Record<string, number>;
  patientGrowthRate: number;
  averagePatientAge: number;
  patientRetentionRate: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  recurringRevenue: number;
  oneTimeRevenue: number;
  averageOrderValue: number;
  revenueByDay: Array<{ date: string; amount: number }>;
  revenueByTreatment: Record<string, number>;
  projectedRevenue: number;
  revenueGrowthRate: number;
}

export interface SubscriptionMetrics {
  totalActiveSubscriptions: number;
  totalPausedSubscriptions: number;
  totalCancelledSubscriptions: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  averageSubscriptionValue: number;
  churnRate: number;
  subscriptionsByMonth: Record<number, number>; // Month 1, 2, 3, etc.
  recentCancellations: Array<{
    patientId: number;
    patientName: string;
    cancelledAt: Date;
    reason?: string;
    monthsActive: number;
  }>;
  recentPauses: Array<{
    patientId: number;
    patientName: string;
    pausedAt: Date;
    resumeAt?: Date;
  }>;
}

export interface PaymentMetrics {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  refundedPayments: number;
  paymentSuccessRate: number;
  averagePaymentAmount: number;
  paymentsByMethod: Record<string, number>;
  yesterdayPayments: Array<{
    patientId: number;
    patientName: string;
    amount: number;
    treatment: string;
    paidAt: Date;
  }>;
}

export interface TreatmentMetrics {
  patientsByTreatmentMonth: Record<number, number>;
  treatmentCompletionRate: number;
  averageTreatmentDuration: number;
  treatmentsByType: Record<string, number>;
  patientsOnMonth: Array<{
    month: number;
    count: number;
    patients: Array<{
      id: number;
      name: string;
      startDate: Date;
      treatment: string;
    }>;
  }>;
}

export interface OrderMetrics {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
  ordersByMedication: Record<string, number>;
  averageFulfillmentTime: number;
}

export interface ComprehensiveReport {
  generatedAt: Date;
  clinicId: number | null;
  dateRange: {
    start: Date;
    end: Date;
    label: string;
  };
  patients: PatientMetrics;
  revenue: RevenueMetrics;
  subscriptions: SubscriptionMetrics;
  payments: PaymentMetrics;
  treatments: TreatmentMetrics;
  orders: OrderMetrics;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate date range based on preset or custom dates
 */
export function calculateDateRange(params: DateRangeParams): { start: Date; end: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (params.range) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        label: 'Today'
      };
      
    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: yesterday,
        end: new Date(today.getTime() - 1),
        label: 'Yesterday'
      };
      
    case 'this_week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return {
        start: weekStart,
        end: now,
        label: 'This Week'
      };
      
    case 'last_week':
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      return {
        start: lastWeekStart,
        end: lastWeekEnd,
        label: 'Last Week'
      };
      
    case 'this_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
        label: 'This Month'
      };
      
    case 'last_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
        label: 'Last Month'
      };
      
    case 'this_quarter':
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return {
        start: quarterStart,
        end: now,
        label: 'This Quarter'
      };
      
    case 'last_quarter':
      const lastQuarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
      const lastQuarterStart = new Date(lastQuarterEnd.getFullYear(), lastQuarterEnd.getMonth() - 2, 1);
      return {
        start: lastQuarterStart,
        end: lastQuarterEnd,
        label: 'Last Quarter'
      };
      
    case 'this_semester':
      const semesterStart = now.getMonth() < 6
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getFullYear(), 6, 1);
      return {
        start: semesterStart,
        end: now,
        label: 'This Semester'
      };
      
    case 'last_semester':
      const lastSemesterEnd = now.getMonth() < 6
        ? new Date(now.getFullYear() - 1, 11, 31)
        : new Date(now.getFullYear(), 5, 30);
      const lastSemesterStart = now.getMonth() < 6
        ? new Date(now.getFullYear() - 1, 6, 1)
        : new Date(now.getFullYear(), 0, 1);
      return {
        start: lastSemesterStart,
        end: lastSemesterEnd,
        label: 'Last Semester'
      };
      
    case 'this_year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: now,
        label: 'This Year'
      };
      
    case 'last_year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31),
        label: 'Last Year'
      };
      
    case 'custom':
      if (!params.startDate || !params.endDate) {
        throw new Error('Custom date range requires startDate and endDate');
      }
      return {
        start: params.startDate,
        end: params.endDate,
        label: `${params.startDate.toLocaleDateString()} - ${params.endDate.toLocaleDateString()}`
      };
      
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
        label: 'This Month'
      };
  }
}

/**
 * Calculate age from date of birth string
 */
function calculateAge(dob: string): number {
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 0;
  }
}

/**
 * Calculate months between two dates
 */
function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

// ============================================================================
// REPORTING SERVICE CLASS
// ============================================================================

export class ReportingService {
  private clinicId: number | null;

  constructor(clinicId?: number) {
    this.clinicId = clinicId ?? getClinicContext() ?? null;
  }

  /**
   * Get clinic filter for queries
   */
  private getClinicFilter() {
    return this.clinicId ? { clinicId: this.clinicId } : {};
  }

  // ==========================================================================
  // PATIENT METRICS
  // ==========================================================================

  async getPatientMetrics(dateRange: DateRangeParams): Promise<PatientMetrics> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    // Total patients
    const totalPatients = await prisma.patient.count({
      where: clinicFilter
    });

    // New patients in date range
    const newPatients = await prisma.patient.count({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      }
    });

    // Patients with recent activity (orders, payments, appointments in last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const activePatientIds = await prisma.patient.findMany({
      where: {
        ...clinicFilter,
        OR: [
          { orders: { some: { createdAt: { gte: ninetyDaysAgo } } } },
          { payments: { some: { createdAt: { gte: ninetyDaysAgo } } } },
          { subscriptions: { some: { status: 'ACTIVE' } } }
        ]
      },
      select: { id: true }
    });
    const activePatients = activePatientIds.length;
    const inactivePatients = totalPatients - activePatients;

    // Patients by source
    const patientsBySourceRaw = await prisma.patient.groupBy({
      by: ['source'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      _count: true
    });
    const patientsBySource: Record<string, number> = {};
    patientsBySourceRaw.forEach(p => {
      patientsBySource[p.source || 'unknown'] = p._count;
    });

    // Patients by gender
    const patientsByGenderRaw = await prisma.patient.groupBy({
      by: ['gender'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      _count: true
    });
    const patientsByGender: Record<string, number> = {};
    patientsByGenderRaw.forEach(p => {
      patientsByGender[p.gender || 'unknown'] = p._count;
    });

    // Calculate growth rate (compare to previous period)
    const periodLength = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = new Date(start.getTime() - 1);

    const previousNewPatients = await prisma.patient.count({
      where: {
        ...clinicFilter,
        createdAt: { gte: previousStart, lte: previousEnd }
      }
    });

    const patientGrowthRate = previousNewPatients > 0
      ? ((newPatients - previousNewPatients) / previousNewPatients) * 100
      : newPatients > 0 ? 100 : 0;

    // Average patient age
    const allPatients = await prisma.patient.findMany({
      where: clinicFilter,
      select: { dob: true }
    });
    const ages = allPatients.map(p => calculateAge(p.dob)).filter(a => a > 0);
    const averagePatientAge = ages.length > 0
      ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
      : 0;

    // Retention rate (patients who made a purchase in both this period and previous period)
    const patientRetentionRate = totalPatients > 0
      ? Math.round((activePatients / totalPatients) * 100)
      : 0;

    return {
      totalPatients,
      newPatients,
      activePatients,
      inactivePatients,
      patientsBySource,
      patientsByGender,
      patientGrowthRate: Math.round(patientGrowthRate * 10) / 10,
      averagePatientAge,
      patientRetentionRate
    };
  }

  // ==========================================================================
  // REVENUE METRICS
  // ==========================================================================

  async getRevenueMetrics(dateRange: DateRangeParams): Promise<RevenueMetrics> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    // Total revenue from successful payments
    const payments = await prisma.payment.findMany({
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: start, lte: end }
      },
      select: {
        amount: true,
        createdAt: true,
        subscriptionId: true
      }
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const recurringRevenue = payments
      .filter(p => p.subscriptionId)
      .reduce((sum, p) => sum + p.amount, 0);
    const oneTimeRevenue = totalRevenue - recurringRevenue;

    // Average order value
    const orders = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          include: {
            payments: {
              where: {
                status: 'SUCCEEDED',
                createdAt: { gte: start, lte: end }
              }
            }
          }
        }
      }
    });

    const orderValues = orders.map(o => 
      o.patient.payments.reduce((sum, p) => sum + p.amount, 0)
    ).filter(v => v > 0);
    
    const averageOrderValue = orderValues.length > 0
      ? Math.round(orderValues.reduce((a, b) => a + b, 0) / orderValues.length)
      : 0;

    // Revenue by day
    const revenueByDay: Array<{ date: string; amount: number }> = [];
    const dayMap = new Map<string, number>();
    
    payments.forEach(p => {
      const dateKey = p.createdAt.toISOString().split('T')[0];
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + p.amount);
    });
    
    dayMap.forEach((amount, date) => {
      revenueByDay.push({ date, amount });
    });
    revenueByDay.sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by treatment (medication)
    const revenueByTreatment: Record<string, number> = {};
    const ordersWithPayments = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          include: {
            payments: {
              where: { status: 'SUCCEEDED' }
            }
          }
        }
      }
    });

    ordersWithPayments.forEach(order => {
      const treatment = order.primaryMedName || 'Unknown';
      const orderPayments = order.patient.payments
        .filter(p => p.createdAt >= start && p.createdAt <= end)
        .reduce((sum, p) => sum + p.amount, 0);
      revenueByTreatment[treatment] = (revenueByTreatment[treatment] || 0) + orderPayments;
    });

    // Calculate growth rate
    const periodLength = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = new Date(start.getTime() - 1);

    const previousPayments = await prisma.payment.aggregate({
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: previousStart, lte: previousEnd }
      },
      _sum: { amount: true }
    });

    const previousRevenue = previousPayments._sum.amount || 0;
    const revenueGrowthRate = previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : totalRevenue > 0 ? 100 : 0;

    // Projected revenue (based on current MRR)
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      select: { amount: true }
    });
    const monthlyRecurring = activeSubscriptions.reduce((sum, s) => sum + s.amount, 0);
    const projectedRevenue = monthlyRecurring * 12;

    return {
      totalRevenue,
      recurringRevenue,
      oneTimeRevenue,
      averageOrderValue,
      revenueByDay,
      revenueByTreatment,
      projectedRevenue,
      revenueGrowthRate: Math.round(revenueGrowthRate * 10) / 10
    };
  }

  // ==========================================================================
  // SUBSCRIPTION METRICS
  // ==========================================================================

  async getSubscriptionMetrics(dateRange: DateRangeParams): Promise<SubscriptionMetrics> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    // Subscription counts by status
    const subscriptionCounts = await prisma.subscription.groupBy({
      by: ['status'],
      where: clinicFilter,
      _count: true
    });

    let totalActiveSubscriptions = 0;
    let totalPausedSubscriptions = 0;
    let totalCancelledSubscriptions = 0;

    subscriptionCounts.forEach(s => {
      if (s.status === 'ACTIVE') totalActiveSubscriptions = s._count;
      if (s.status === 'PAUSED') totalPausedSubscriptions = s._count;
      if (s.status === 'CANCELED') totalCancelledSubscriptions = s._count;
    });

    // Monthly Recurring Revenue (MRR)
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      select: { amount: true, interval: true, intervalCount: true }
    });

    const monthlyRecurringRevenue = activeSubscriptions.reduce((sum, s) => {
      if (s.interval === 'month') return sum + (s.amount / s.intervalCount);
      if (s.interval === 'year') return sum + (s.amount / 12);
      return sum + s.amount;
    }, 0);

    const annualRecurringRevenue = monthlyRecurringRevenue * 12;

    const averageSubscriptionValue = activeSubscriptions.length > 0
      ? Math.round(activeSubscriptions.reduce((sum, s) => sum + s.amount, 0) / activeSubscriptions.length)
      : 0;

    // Churn rate (cancelled in period / total at start of period)
    const cancelledInPeriod = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end }
      }
    });

    const totalAtStart = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        createdAt: { lt: start },
        OR: [
          { status: 'ACTIVE' },
          { canceledAt: { gte: start } }
        ]
      }
    });

    const churnRate = totalAtStart > 0
      ? Math.round((cancelledInPeriod / totalAtStart) * 100 * 10) / 10
      : 0;

    // Subscriptions by treatment month
    const allActiveSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      select: { startDate: true }
    });

    const subscriptionsByMonth: Record<number, number> = {};
    const now = new Date();
    
    allActiveSubscriptions.forEach(s => {
      const months = monthsBetween(s.startDate, now) + 1;
      subscriptionsByMonth[months] = (subscriptionsByMonth[months] || 0) + 1;
    });

    // Recent cancellations
    const recentCancellations = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { canceledAt: 'desc' },
      take: 20
    });

    // Recent pauses
    const recentPauses = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'PAUSED',
        pausedAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { pausedAt: 'desc' },
      take: 20
    });

    return {
      totalActiveSubscriptions,
      totalPausedSubscriptions,
      totalCancelledSubscriptions,
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue),
      annualRecurringRevenue: Math.round(annualRecurringRevenue),
      averageSubscriptionValue,
      churnRate,
      subscriptionsByMonth,
      recentCancellations: recentCancellations.map(s => ({
        patientId: s.patient.id,
        patientName: `${s.patient.firstName} ${s.patient.lastName}`,
        cancelledAt: s.canceledAt!,
        monthsActive: monthsBetween(s.startDate, s.canceledAt || new Date())
      })),
      recentPauses: recentPauses.map(s => ({
        patientId: s.patient.id,
        patientName: `${s.patient.firstName} ${s.patient.lastName}`,
        pausedAt: s.pausedAt!,
        resumeAt: s.resumeAt || undefined
      }))
    };
  }

  // ==========================================================================
  // PAYMENT METRICS
  // ==========================================================================

  async getPaymentMetrics(dateRange: DateRangeParams): Promise<PaymentMetrics> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    // Payment counts by status
    const paymentCounts = await prisma.payment.groupBy({
      by: ['status'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      _count: true,
      _sum: { amount: true }
    });

    let totalPayments = 0;
    let successfulPayments = 0;
    let failedPayments = 0;
    let pendingPayments = 0;
    let refundedPayments = 0;
    let totalAmount = 0;

    paymentCounts.forEach(p => {
      totalPayments += p._count;
      if (p.status === 'SUCCEEDED') {
        successfulPayments = p._count;
        totalAmount += p._sum.amount || 0;
      }
      if (p.status === 'FAILED') failedPayments = p._count;
      if (p.status === 'PENDING') pendingPayments = p._count;
      if (p.status === 'REFUNDED') refundedPayments = p._count;
    });

    const paymentSuccessRate = totalPayments > 0
      ? Math.round((successfulPayments / totalPayments) * 100)
      : 0;

    const averagePaymentAmount = successfulPayments > 0
      ? Math.round(totalAmount / successfulPayments)
      : 0;

    // Payments by method
    const paymentsByMethodRaw = await prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: start, lte: end }
      },
      _count: true
    });

    const paymentsByMethod: Record<string, number> = {};
    paymentsByMethodRaw.forEach(p => {
      paymentsByMethod[p.paymentMethod || 'unknown'] = p._count;
    });

    // Yesterday's payments
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const yesterdayPaymentsRaw = await prisma.payment.findMany({
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd }
      },
      include: {
        patient: {
          include: {
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const yesterdayPayments = yesterdayPaymentsRaw.map(p => ({
      patientId: p.patient.id,
      patientName: `${p.patient.firstName} ${p.patient.lastName}`,
      amount: p.amount,
      treatment: p.patient.orders[0]?.primaryMedName || 'Unknown',
      paidAt: p.createdAt
    }));

    return {
      totalPayments,
      successfulPayments,
      failedPayments,
      pendingPayments,
      refundedPayments,
      paymentSuccessRate,
      averagePaymentAmount,
      paymentsByMethod,
      yesterdayPayments
    };
  }

  // ==========================================================================
  // TREATMENT METRICS
  // ==========================================================================

  async getTreatmentMetrics(dateRange: DateRangeParams): Promise<TreatmentMetrics> {
    const clinicFilter = this.getClinicFilter();
    const now = new Date();

    // Get all active subscriptions with patient info
    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
          include: {
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { primaryMedName: true, createdAt: true }
            }
          }
        }
      }
    });

    // Group by treatment month
    const patientsByTreatmentMonth: Record<number, number> = {};
    const patientsOnMonth: Array<{
      month: number;
      count: number;
      patients: Array<{ id: number; name: string; startDate: Date; treatment: string }>;
    }> = [];

    const monthGroups = new Map<number, Array<{ id: number; name: string; startDate: Date; treatment: string }>>();

    subscriptions.forEach(s => {
      const months = monthsBetween(s.startDate, now) + 1;
      patientsByTreatmentMonth[months] = (patientsByTreatmentMonth[months] || 0) + 1;

      if (!monthGroups.has(months)) {
        monthGroups.set(months, []);
      }
      monthGroups.get(months)!.push({
        id: s.patient.id,
        name: `${s.patient.firstName} ${s.patient.lastName}`,
        startDate: s.startDate,
        treatment: s.patient.orders[0]?.primaryMedName || s.planName
      });
    });

    monthGroups.forEach((patients, month) => {
      patientsOnMonth.push({
        month,
        count: patients.length,
        patients
      });
    });
    patientsOnMonth.sort((a, b) => a.month - b.month);

    // Treatment completion rate (completed subscriptions / total ended)
    const completedSubscriptions = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        status: 'EXPIRED',
        endedAt: { not: null }
      }
    });

    const totalEndedSubscriptions = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        OR: [
          { status: 'EXPIRED' },
          { status: 'CANCELED' }
        ]
      }
    });

    const treatmentCompletionRate = totalEndedSubscriptions > 0
      ? Math.round((completedSubscriptions / totalEndedSubscriptions) * 100)
      : 0;

    // Average treatment duration
    const endedSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        endedAt: { not: null }
      },
      select: { startDate: true, endedAt: true }
    });

    const durations = endedSubscriptions.map(s => 
      monthsBetween(s.startDate, s.endedAt!)
    );
    const averageTreatmentDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // Treatments by type
    const treatmentsByType: Record<string, number> = {};
    const orders = await prisma.order.groupBy({
      by: ['primaryMedName'],
      where: clinicFilter,
      _count: true
    });

    orders.forEach(o => {
      treatmentsByType[o.primaryMedName || 'Unknown'] = o._count;
    });

    return {
      patientsByTreatmentMonth,
      treatmentCompletionRate,
      averageTreatmentDuration,
      treatmentsByType,
      patientsOnMonth
    };
  }

  // ==========================================================================
  // ORDER METRICS
  // ==========================================================================

  async getOrderMetrics(dateRange: DateRangeParams): Promise<OrderMetrics> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    // Order counts
    const totalOrders = await prisma.order.count({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      }
    });

    // Orders by status
    const ordersByStatusRaw = await prisma.order.groupBy({
      by: ['status'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      _count: true
    });

    const ordersByStatus: Record<string, number> = {};
    let pendingOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;

    ordersByStatusRaw.forEach(o => {
      const status = o.status || 'unknown';
      ordersByStatus[status] = o._count;
      
      if (['pending', 'processing', 'submitted'].includes(status.toLowerCase())) {
        pendingOrders += o._count;
      }
      if (['completed', 'shipped', 'delivered'].includes(status.toLowerCase())) {
        completedOrders += o._count;
      }
      if (['cancelled', 'canceled', 'rejected'].includes(status.toLowerCase())) {
        cancelledOrders += o._count;
      }
    });

    // Orders by medication
    const ordersByMedicationRaw = await prisma.order.groupBy({
      by: ['primaryMedName'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      _count: true
    });

    const ordersByMedication: Record<string, number> = {};
    ordersByMedicationRaw.forEach(o => {
      ordersByMedication[o.primaryMedName || 'Unknown'] = o._count;
    });

    // Average order value (from related payments)
    const ordersWithPayments = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          include: {
            payments: {
              where: { status: 'SUCCEEDED' }
            }
          }
        }
      }
    });

    const orderValues = ordersWithPayments.map(o => 
      o.patient.payments.reduce((sum, p) => sum + p.amount, 0)
    ).filter(v => v > 0);

    const averageOrderValue = orderValues.length > 0
      ? Math.round(orderValues.reduce((a, b) => a + b, 0) / orderValues.length)
      : 0;

    // Average fulfillment time (from created to shipped)
    const fulfilledOrders = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
        shippingStatus: { not: null }
      },
      select: { createdAt: true, lastWebhookAt: true }
    });

    const fulfillmentTimes = fulfilledOrders
      .filter(o => o.lastWebhookAt)
      .map(o => (o.lastWebhookAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60)); // hours

    const averageFulfillmentTime = fulfillmentTimes.length > 0
      ? Math.round(fulfillmentTimes.reduce((a, b) => a + b, 0) / fulfillmentTimes.length)
      : 0;

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      averageOrderValue,
      ordersByStatus,
      ordersByMedication,
      averageFulfillmentTime
    };
  }

  // ==========================================================================
  // COMPREHENSIVE REPORT
  // ==========================================================================

  async generateComprehensiveReport(dateRange: DateRangeParams): Promise<ComprehensiveReport> {
    const { start, end, label } = calculateDateRange(dateRange);

    logger.info('Generating comprehensive report', {
      clinicId: this.clinicId,
      dateRange: label,
      start: start.toISOString(),
      end: end.toISOString()
    });

    const [patients, revenue, subscriptions, payments, treatments, orders] = await Promise.all([
      this.getPatientMetrics(dateRange),
      this.getRevenueMetrics(dateRange),
      this.getSubscriptionMetrics(dateRange),
      this.getPaymentMetrics(dateRange),
      this.getTreatmentMetrics(dateRange),
      this.getOrderMetrics(dateRange)
    ]);

    return {
      generatedAt: new Date(),
      clinicId: this.clinicId,
      dateRange: { start, end, label },
      patients,
      revenue,
      subscriptions,
      payments,
      treatments,
      orders
    };
  }

  // ==========================================================================
  // SPECIFIC QUERIES
  // ==========================================================================

  /**
   * Get patients who paid yesterday with treatment details
   */
  async getYesterdayPayments() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    const clinicFilter = this.getClinicFilter();

    return prisma.payment.findMany({
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              select: { planName: true, startDate: true, amount: true }
            },
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { primaryMedName: true, primaryMedStrength: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get patients by treatment month
   */
  async getPatientsByTreatmentMonth(month: number) {
    const clinicFilter = this.getClinicFilter();
    const now = new Date();

    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      }
    });

    return subscriptions
      .filter(s => {
        const months = monthsBetween(s.startDate, now) + 1;
        return months === month;
      })
      .map(s => ({
        ...s.patient,
        subscriptionId: s.id,
        planName: s.planName,
        startDate: s.startDate,
        monthsActive: month
      }));
  }

  /**
   * Get cancelled subscriptions with details
   */
  async getCancelledSubscriptions(dateRange: DateRangeParams) {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    return prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end }
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { canceledAt: 'desc' }
    });
  }

  /**
   * Get paused subscriptions with details
   */
  async getPausedSubscriptions() {
    const clinicFilter = this.getClinicFilter();

    return prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'PAUSED'
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { pausedAt: 'desc' }
    });
  }

  /**
   * Get recurring revenue breakdown
   */
  async getRecurringRevenueBreakdown() {
    const clinicFilter = this.getClinicFilter();

    const subscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE'
      },
      select: {
        amount: true,
        interval: true,
        intervalCount: true,
        planName: true
      }
    });

    const byPlan: Record<string, { count: number; mrr: number }> = {};

    subscriptions.forEach(s => {
      const plan = s.planName || 'Unknown';
      let monthlyAmount = s.amount;
      
      if (s.interval === 'year') {
        monthlyAmount = s.amount / 12;
      } else if (s.interval === 'month' && s.intervalCount > 1) {
        monthlyAmount = s.amount / s.intervalCount;
      }

      if (!byPlan[plan]) {
        byPlan[plan] = { count: 0, mrr: 0 };
      }
      byPlan[plan].count++;
      byPlan[plan].mrr += monthlyAmount;
    });

    const totalMRR = Object.values(byPlan).reduce((sum, p) => sum + p.mrr, 0);

    return {
      totalMRR: Math.round(totalMRR),
      totalARR: Math.round(totalMRR * 12),
      byPlan,
      subscriptionCount: subscriptions.length
    };
  }
}

// Export singleton for convenience
export const reportingService = new ReportingService();
