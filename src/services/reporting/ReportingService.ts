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

import { prisma, getClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Patient, Payment, Subscription, Order } from '@prisma/client';
import { decryptPHI } from '@/lib/security/phi-encryption';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

// Use singleton Prisma client for reporting
// Note: For super admin reporting across clinics, use getClinicContext() to control filtering

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Helper types for Prisma groupBy results
type PatientSourceGroupBy = { source: string | null; _count: number };
type PatientGenderGroupBy = { gender: string | null; _count: number };
type PatientStateGroupBy = { state: string; _count: number };
type SubscriptionStatusGroupBy = { status: string; _count: number };
type PaymentStatusGroupBy = { status: string; _count: number; _sum: { amount: number | null } };
type PaymentMethodGroupBy = { paymentMethod: string | null; _count: number };
type OrderStatusGroupBy = { status: string | null; _count: number };
type OrderMedicationGroupBy = { primaryMedName: string | null; _count: number };

// Helper types for query results with specific selects
type PaymentSelect = Pick<Payment, 'amount' | 'createdAt' | 'subscriptionId'>;
type PatientDobSelect = Pick<Patient, 'dob'>;
type SubscriptionAmountSelect = Pick<Subscription, 'amount'>;
type SubscriptionMRRSelect = Pick<Subscription, 'amount' | 'interval' | 'intervalCount'>;
type SubscriptionStartDateSelect = Pick<Subscription, 'startDate'>;
type SubscriptionEndedSelect = Pick<Subscription, 'startDate' | 'endedAt'>;
type SubscriptionPlanSelect = Pick<
  Subscription,
  'amount' | 'interval' | 'intervalCount' | 'planName'
>;
type OrderFulfillmentSelect = Pick<Order, 'createdAt' | 'lastWebhookAt'>;

// Helper types for includes
type PatientWithPayments = { payments: Payment[] };
type OrderWithPatientPayments = Order & { patient: Patient & PatientWithPayments };

type SubscriptionWithPatient = Subscription & {
  patient: Pick<Patient, 'id' | 'firstName' | 'lastName'>;
};

type SubscriptionWithPatientFull = Subscription & {
  patient: Patient;
};

type PaymentWithPatientOrders = Payment & {
  patient: Patient & {
    orders: Array<Pick<Order, 'primaryMedName'>>;
  };
};

// Revenue by day entry
type RevenueByDayEntry = { date: string; amount: number };

// Patients on month entry
type PatientOnMonthEntry = { id: number; name: string; startDate: Date; treatment: string };
type PatientsOnMonthGroup = { month: number; count: number; patients: PatientOnMonthEntry[] };

// Recurring revenue breakdown
type PlanBreakdown = { count: number; mrr: number };

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

// Demographics reporting
export interface DemographicsSummary {
  totalPatients: number;
  newInPeriod: number;
  activePatients: number;
  averageAge: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  maleFemaleRatio: number; // male/female; 0 if no females
  genderBreakdown: Array<{ value: string; count: number; percentage: number }>;
}

export interface PatientsByStateEntry {
  state: string;
  count: number;
  percentage: number;
}

export interface PatientsByAgeBucketEntry {
  bucket: string;
  count: number;
  percentage: number;
}

const DEFAULT_AGE_BUCKETS = [
  { label: '18-24', min: 18, max: 24 },
  { label: '25-34', min: 25, max: 34 },
  { label: '35-44', min: 35, max: 44 },
  { label: '45-54', min: 45, max: 54 },
  { label: '55-64', min: 55, max: 64 },
  { label: '65+', min: 65, max: 150 },
];

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
  retentionRate: number;
  /** Average lifetime value (total payments) per patient, in cents */
  averageLTV: number;
  /** Median LTV in cents */
  medianLTV: number;
  /** Total LTV across all patients in cents */
  totalLTV: number;
  /** Number of patients with at least one successful payment */
  patientsWithPayments: number;
  /** MRR lost from subscriptions cancelled in period (cents) */
  churnedMrr: number;
  /** MRR from new subscriptions started in period (cents) */
  newMrrInPeriod: number;
  /** Net MRR change in period (cents) */
  netMrrChange: number;
  /** Average days from start to cancel for subscriptions churned in period */
  averageLifetimeBeforeChurnDays: number;
  /** Top churn reasons with count, MRR, and percentage */
  churnReasons: Array<{
    reason: string;
    count: number;
    mrr: number;
    percentageOfTotal: number;
  }>;
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
  /** Breakdown by medication (e.g. Semaglutide, Tirzepatide, NAD). */
  byMedication: Array<{ medication: string; count: number; mrr: number; percentageOfTotal: number }>;
  /** Breakdown by interval (Monthly, 3 months, 6 months, 12 months). */
  byInterval: Array<{ intervalLabel: string; count: number; mrr: number; percentageOfTotal: number }>;
  /** Cross breakdown: medication × interval (e.g. Semaglutide Monthly, Tirzepatide 3 months). */
  byMedicationAndInterval: Array<{
    medication: string;
    intervalLabel: string;
    count: number;
    mrr: number;
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
export function calculateDateRange(params: DateRangeParams): {
  start: Date;
  end: Date;
  label: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (params.range) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        label: 'Today',
      };

    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        start: yesterday,
        end: new Date(today.getTime() - 1),
        label: 'Yesterday',
      };

    case 'this_week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return {
        start: weekStart,
        end: now,
        label: 'This Week',
      };

    case 'last_week':
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      return {
        start: lastWeekStart,
        end: lastWeekEnd,
        label: 'Last Week',
      };

    case 'this_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
        label: 'This Month',
      };

    case 'last_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
        label: 'Last Month',
      };

    case 'this_quarter':
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return {
        start: quarterStart,
        end: now,
        label: 'This Quarter',
      };

    case 'last_quarter':
      const lastQuarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
      const lastQuarterStart = new Date(
        lastQuarterEnd.getFullYear(),
        lastQuarterEnd.getMonth() - 2,
        1
      );
      return {
        start: lastQuarterStart,
        end: lastQuarterEnd,
        label: 'Last Quarter',
      };

    case 'this_semester':
      const semesterStart =
        now.getMonth() < 6 ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), 6, 1);
      return {
        start: semesterStart,
        end: now,
        label: 'This Semester',
      };

    case 'last_semester':
      const lastSemesterEnd =
        now.getMonth() < 6
          ? new Date(now.getFullYear() - 1, 11, 31)
          : new Date(now.getFullYear(), 5, 30);
      const lastSemesterStart =
        now.getMonth() < 6
          ? new Date(now.getFullYear() - 1, 6, 1)
          : new Date(now.getFullYear(), 0, 1);
      return {
        start: lastSemesterStart,
        end: lastSemesterEnd,
        label: 'Last Semester',
      };

    case 'this_year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: now,
        label: 'This Year',
      };

    case 'last_year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31),
        label: 'Last Year',
      };

    case 'custom':
      if (!params.startDate || !params.endDate) {
        throw new Error('Custom date range requires startDate and endDate');
      }
      return {
        start: params.startDate,
        end: params.endDate,
        label: `${params.startDate.toLocaleDateString()} - ${params.endDate.toLocaleDateString()}`,
      };

    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
        label: 'This Month',
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

/**
 * Normalize subscription amount to monthly (MRR) in cents
 */
function subscriptionToMonthlyCents(amount: number, interval: string | null, intervalCount: number = 1): number {
  const n = Math.max(1, intervalCount);
  switch ((interval || 'month').toLowerCase()) {
    case 'year':
      return Math.round(amount / 12 / n);
    case 'month':
      return Math.round(amount / n);
    case 'week':
      return Math.round((amount * 52) / 12 / n);
    default:
      return amount;
  }
}

/**
 * Days between two dates
 */
function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/** Known medication keywords (lowercase) for grouping planName. First match wins. */
const MEDICATION_KEYWORDS: Array<{ key: string; label: string }> = [
  { key: 'semaglutide', label: 'Semaglutide' },
  { key: 'tirzepatide', label: 'Tirzepatide' },
  { key: 'nad', label: 'NAD' },
  { key: 'sermorelin', label: 'Sermorelin' },
  { key: 'testosterone', label: 'Testosterone' },
  { key: 'ozempic', label: 'Semaglutide' },
  { key: 'wegovy', label: 'Semaglutide' },
  { key: 'mounjaro', label: 'Tirzepatide' },
  { key: 'zepbound', label: 'Tirzepatide' },
  { key: 'glp-1', label: 'GLP-1' },
];

/**
 * Normalize planName to a medication bucket for reporting (e.g. "Semaglutide 3 Month" → "Semaglutide").
 */
export function normalizeMedicationFromPlanName(planName: string | null): string {
  if (!planName || !String(planName).trim()) return 'Other';
  const lower = String(planName).toLowerCase();
  for (const { key, label } of MEDICATION_KEYWORDS) {
    if (lower.includes(key)) return label;
  }
  return 'Other';
}

/**
 * Normalize interval + intervalCount to a display label (e.g. monthly, 3 months, 6 months, 12 months).
 */
export function normalizeIntervalLabel(interval: string | null, intervalCount: number): string {
  const i = (interval || 'month').toLowerCase();
  const n = Math.max(1, intervalCount);
  if (i === 'year') return '12 months';
  if (i === 'month') {
    if (n === 1) return 'Monthly';
    if (n === 3) return '3 months';
    if (n === 6) return '6 months';
    if (n === 12) return '12 months';
    return `${n} months`;
  }
  if (i === 'week') return n === 4 ? 'Monthly' : `${n} weeks`;
  return `${n} ${i}`;
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
      where: clinicFilter,
    });

    // New patients in date range
    const newPatients = await prisma.patient.count({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
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
          { subscriptions: { some: { status: 'ACTIVE' } } },
        ],
      },
      select: { id: true },
    });
    const activePatients = activePatientIds.length;
    const inactivePatients = totalPatients - activePatients;

    // Patients by source
    const patientsBySourceRaw = await prisma.patient.groupBy({
      by: ['source'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });
    const patientsBySource: Record<string, number> = {};
    patientsBySourceRaw.forEach((p: PatientSourceGroupBy) => {
      patientsBySource[p.source || 'unknown'] = p._count;
    });

    // Patients by gender
    const patientsByGenderRaw = await prisma.patient.groupBy({
      by: ['gender'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });
    const patientsByGender: Record<string, number> = {};
    patientsByGenderRaw.forEach((p: PatientGenderGroupBy) => {
      patientsByGender[p.gender || 'unknown'] = p._count;
    });

    // Calculate growth rate (compare to previous period)
    const periodLength = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = new Date(start.getTime() - 1);

    const previousNewPatients = await prisma.patient.count({
      where: {
        ...clinicFilter,
        createdAt: { gte: previousStart, lte: previousEnd },
      },
    });

    const patientGrowthRate =
      previousNewPatients > 0
        ? ((newPatients - previousNewPatients) / previousNewPatients) * 100
        : newPatients > 0
          ? 100
          : 0;

    // Average patient age
    const allPatients = await prisma.patient.findMany({
      where: clinicFilter,
      select: { dob: true },
    });
    const ages = allPatients
      .map((p: PatientDobSelect) => calculateAge(p.dob))
      .filter((a: number) => a > 0);
    const averagePatientAge =
      ages.length > 0
        ? Math.round(ages.reduce((a: number, b: number) => a + b, 0) / ages.length)
        : 0;

    // Retention rate (patients who made a purchase in both this period and previous period)
    const patientRetentionRate =
      totalPatients > 0 ? Math.round((activePatients / totalPatients) * 100) : 0;

    return {
      totalPatients,
      newPatients,
      activePatients,
      inactivePatients,
      patientsBySource,
      patientsByGender,
      patientGrowthRate: Math.round(patientGrowthRate * 10) / 10,
      averagePatientAge,
      patientRetentionRate,
    };
  }

  // ==========================================================================
  // DEMOGRAPHICS
  // ==========================================================================

  /**
   * Normalize gender for consistent grouping
   */
  private normalizeGender(raw: string | null): 'Male' | 'Female' | 'Other' {
    if (!raw || typeof raw !== 'string') return 'Other';
    const v = raw.trim().toLowerCase();
    if (['m', 'male'].includes(v)) return 'Male';
    if (['f', 'female'].includes(v)) return 'Female';
    return 'Other';
  }

  /**
   * Get patients grouped by state
   */
  async getPatientsByState(
    dateRange: DateRangeParams
  ): Promise<PatientsByStateEntry[]> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    const byState = await prisma.patient.groupBy({
      by: ['state'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });

    const total = byState.reduce((sum: number, r: PatientStateGroupBy) => sum + r._count, 0);
    return (byState as PatientStateGroupBy[])
      .map((r) => ({
        state: r.state || 'Unknown',
        count: r._count,
        percentage: total > 0 ? Math.round((r._count / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get patients grouped by age bucket
   */
  async getPatientsByAgeBucket(
    dateRange: DateRangeParams,
    buckets = DEFAULT_AGE_BUCKETS
  ): Promise<PatientsByAgeBucketEntry[]> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    const patients = await prisma.patient.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      select: { dob: true },
    });

    const bucketCounts = new Map<string, number>();
    buckets.forEach((b) => bucketCounts.set(b.label, 0));

    let validCount = 0;
    patients.forEach((p: PatientDobSelect) => {
      const rawDob = safeDecrypt(p.dob) || p.dob;
      const age = calculateAge(rawDob);
      if (age > 0 && age < 150) {
        validCount++;
        for (const b of buckets) {
          if (age >= b.min && age <= b.max) {
            bucketCounts.set(b.label, (bucketCounts.get(b.label) || 0) + 1);
            break;
          }
        }
      }
    });

    const total = validCount;
    return buckets.map((b) => ({
      bucket: b.label,
      count: bucketCounts.get(b.label) || 0,
      percentage: total > 0 ? Math.round(((bucketCounts.get(b.label) || 0) / total) * 10000) / 100 : 0,
    }));
  }

  /**
   * Get demographics summary with male/female ratio and gender breakdown
   */
  async getDemographicsSummary(
    dateRange: DateRangeParams
  ): Promise<DemographicsSummary> {
    const { start, end } = calculateDateRange(dateRange);
    const clinicFilter = this.getClinicFilter();

    const [totalCount, newCount, activeCount, byGenderRaw, patientsForAge] =
      await Promise.all([
        prisma.patient.count({ where: clinicFilter }),
        prisma.patient.count({
          where: { ...clinicFilter, createdAt: { gte: start, lte: end } },
        }),
        (async () => {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          return prisma.patient.count({
            where: {
              ...clinicFilter,
              OR: [
                { orders: { some: { createdAt: { gte: ninetyDaysAgo } } } },
                { payments: { some: { createdAt: { gte: ninetyDaysAgo } } } },
                { subscriptions: { some: { status: 'ACTIVE' } } },
              ],
            },
          });
        })(),
        prisma.patient.groupBy({
          by: ['gender'],
          where: { ...clinicFilter, createdAt: { gte: start, lte: end } },
          _count: true,
        }),
        prisma.patient.findMany({
          where: { ...clinicFilter, createdAt: { gte: start, lte: end } },
          select: { dob: true, gender: true },
        }),
      ]);

    // Normalize gender and compute ratio
    const male: number[] = [];
    const female: number[] = [];
    const other: number[] = [];
    (byGenderRaw as PatientGenderGroupBy[]).forEach((g) => {
      const norm = this.normalizeGender(g.gender);
      const c = g._count;
      if (norm === 'Male') male.push(c);
      else if (norm === 'Female') female.push(c);
      else other.push(c);
    });
    const maleCount = male.reduce((a, b) => a + b, 0);
    const femaleCount = female.reduce((a, b) => a + b, 0);
    const otherCount = other.reduce((a, b) => a + b, 0);
    const maleFemaleRatio = femaleCount > 0 ? Math.round((maleCount / femaleCount) * 100) / 100 : 0;

    const genderTotal = maleCount + femaleCount + otherCount;
    const genderBreakdown: Array<{ value: string; count: number; percentage: number }> = [];
    if (maleCount > 0)
      genderBreakdown.push({
        value: 'Male',
        count: maleCount,
        percentage: genderTotal > 0 ? Math.round((maleCount / genderTotal) * 10000) / 100 : 0,
      });
    if (femaleCount > 0)
      genderBreakdown.push({
        value: 'Female',
        count: femaleCount,
        percentage: genderTotal > 0 ? Math.round((femaleCount / genderTotal) * 10000) / 100 : 0,
      });
    if (otherCount > 0)
      genderBreakdown.push({
        value: 'Other',
        count: otherCount,
        percentage: genderTotal > 0 ? Math.round((otherCount / genderTotal) * 10000) / 100 : 0,
      });

    // Average age
    const ages = patientsForAge
      .map((p: { dob: string; gender: string | null }) => {
        const rawDob = safeDecrypt(p.dob) || p.dob;
        return calculateAge(rawDob);
      })
      .filter((a: number) => a > 0);
    const averageAge =
      ages.length > 0 ? Math.round(ages.reduce((a: number, b: number) => a + b, 0) / ages.length) : 0;

    return {
      totalPatients: totalCount,
      newInPeriod: newCount,
      activePatients: activeCount,
      averageAge,
      maleCount,
      femaleCount,
      otherCount,
      maleFemaleRatio,
      genderBreakdown,
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
        createdAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        createdAt: true,
        subscriptionId: true,
      },
    });

    const totalRevenue = payments.reduce((sum: number, p: PaymentSelect) => sum + p.amount, 0);
    const recurringRevenue = payments
      .filter((p: PaymentSelect) => p.subscriptionId)
      .reduce((sum: number, p: PaymentSelect) => sum + p.amount, 0);
    const oneTimeRevenue = totalRevenue - recurringRevenue;

    // Average order value
    const orders = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          include: {
            payments: {
              where: {
                status: 'SUCCEEDED',
                createdAt: { gte: start, lte: end },
              },
            },
          },
        },
      },
    });

    const orderValues = orders
      .map((o: OrderWithPatientPayments) =>
        o.patient.payments.reduce((sum: number, p: Payment) => sum + p.amount, 0)
      )
      .filter((v: number) => v > 0);

    const averageOrderValue =
      orderValues.length > 0
        ? Math.round(orderValues.reduce((a: number, b: number) => a + b, 0) / orderValues.length)
        : 0;

    // Revenue by day
    const revenueByDay: Array<{ date: string; amount: number }> = [];
    const dayMap = new Map<string, number>();

    payments.forEach((p: PaymentSelect) => {
      const dateKey = p.createdAt.toISOString().split('T')[0];
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + p.amount);
    });

    dayMap.forEach((amount: number, date: string) => {
      revenueByDay.push({ date, amount });
    });
    revenueByDay.sort((a: RevenueByDayEntry, b: RevenueByDayEntry) => a.date.localeCompare(b.date));

    // Revenue by treatment (medication)
    const revenueByTreatment: Record<string, number> = {};
    const ordersWithPayments = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          include: {
            payments: {
              where: { status: 'SUCCEEDED' },
            },
          },
        },
      },
    });

    ordersWithPayments.forEach((order: OrderWithPatientPayments) => {
      const treatment = order.primaryMedName || 'Unknown';
      const orderPayments = order.patient.payments
        .filter((p: Payment) => p.createdAt >= start && p.createdAt <= end)
        .reduce((sum: number, p: Payment) => sum + p.amount, 0);
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
        createdAt: { gte: previousStart, lte: previousEnd },
      },
      _sum: { amount: true },
    });

    const previousRevenue = previousPayments._sum.amount || 0;
    const revenueGrowthRate =
      previousRevenue > 0
        ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
        : totalRevenue > 0
          ? 100
          : 0;

    // Projected revenue (based on current MRR)
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE',
      },
      select: { amount: true },
    });
    const monthlyRecurring = activeSubscriptions.reduce(
      (sum: number, s: SubscriptionAmountSelect) => sum + s.amount,
      0
    );
    const projectedRevenue = monthlyRecurring * 12;

    return {
      totalRevenue,
      recurringRevenue,
      oneTimeRevenue,
      averageOrderValue,
      revenueByDay,
      revenueByTreatment,
      projectedRevenue,
      revenueGrowthRate: Math.round(revenueGrowthRate * 10) / 10,
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
      _count: true,
    });

    let totalActiveSubscriptions = 0;
    let totalPausedSubscriptions = 0;
    let totalCancelledSubscriptions = 0;

    subscriptionCounts.forEach((s: SubscriptionStatusGroupBy) => {
      if (s.status === 'ACTIVE') totalActiveSubscriptions = s._count;
      if (s.status === 'PAUSED') totalPausedSubscriptions = s._count;
      if (s.status === 'CANCELED') totalCancelledSubscriptions = s._count;
    });

    // Monthly Recurring Revenue (MRR)
    const activeSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE',
      },
      select: { amount: true, interval: true, intervalCount: true, planName: true },
    });

    const monthlyRecurringRevenue = activeSubscriptions.reduce(
      (sum: number, s: { amount: number; interval: string | null; intervalCount: number | null }) => {
        const n = Math.max(1, s.intervalCount ?? 1);
        if (s.interval === 'month') return sum + s.amount / n;
        if (s.interval === 'year') return sum + s.amount / 12;
        return sum + s.amount;
      },
      0
    );

    const annualRecurringRevenue = monthlyRecurringRevenue * 12;

    const averageSubscriptionValue =
      activeSubscriptions.length > 0
        ? Math.round(
            activeSubscriptions.reduce(
              (sum: number, s: SubscriptionMRRSelect) => sum + s.amount,
              0
            ) / activeSubscriptions.length
          )
        : 0;

    // Churn rate (cancelled in period / total at start of period)
    const cancelledInPeriod = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end },
      },
    });

    const totalAtStart = await prisma.subscription.count({
      where: {
        ...clinicFilter,
        createdAt: { lt: start },
        OR: [{ status: 'ACTIVE' }, { canceledAt: { gte: start } }],
      },
    });

    const churnRate =
      totalAtStart > 0 ? Math.round((cancelledInPeriod / totalAtStart) * 100 * 10) / 10 : 0;

    // Subscriptions by treatment month
    const allActiveSubscriptions = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE',
      },
      select: { startDate: true },
    });

    const subscriptionsByMonth: Record<number, number> = {};
    const now = new Date();

    allActiveSubscriptions.forEach((s: SubscriptionStartDateSelect) => {
      const months = monthsBetween(s.startDate, now) + 1;
      subscriptionsByMonth[months] = (subscriptionsByMonth[months] || 0) + 1;
    });

    // Breakdown by medication, by interval, and by medication × interval
    type SubForBreakdown = { amount: number; interval: string | null; intervalCount: number | null; planName: string | null };
    const medicationMap = new Map<string, { count: number; mrr: number }>();
    const intervalMap = new Map<string, { count: number; mrr: number }>();
    const medicationIntervalMap = new Map<string, { count: number; mrr: number }>();

    activeSubscriptions.forEach((s: SubForBreakdown) => {
      const medication = normalizeMedicationFromPlanName(s.planName);
      const intervalLabel = normalizeIntervalLabel(s.interval, s.intervalCount || 1);
      const mrr = subscriptionToMonthlyCents(s.amount, s.interval, s.intervalCount || 1);

      const medEntry = medicationMap.get(medication);
      if (medEntry) {
        medEntry.count += 1;
        medEntry.mrr += mrr;
      } else {
        medicationMap.set(medication, { count: 1, mrr });
      }

      const intEntry = intervalMap.get(intervalLabel);
      if (intEntry) {
        intEntry.count += 1;
        intEntry.mrr += mrr;
      } else {
        intervalMap.set(intervalLabel, { count: 1, mrr });
      }

      const key = `${medication}|${intervalLabel}`;
      const crossEntry = medicationIntervalMap.get(key);
      if (crossEntry) {
        crossEntry.count += 1;
        crossEntry.mrr += mrr;
      } else {
        medicationIntervalMap.set(key, { count: 1, mrr });
      }
    });

    const totalCount = activeSubscriptions.length;
    const totalMrrForPct = monthlyRecurringRevenue || 1;
    const byMedication = Array.from(medicationMap.entries())
      .map(([medication, data]) => ({
        medication,
        count: data.count,
        mrr: Math.round(data.mrr),
        percentageOfTotal: totalCount > 0 ? Math.round((data.count / totalCount) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const byInterval = Array.from(intervalMap.entries())
      .map(([intervalLabel, data]) => ({
        intervalLabel,
        count: data.count,
        mrr: Math.round(data.mrr),
        percentageOfTotal: totalCount > 0 ? Math.round((data.count / totalCount) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const intervalOrder = ['Monthly', '3 months', '6 months', '12 months'];
    const byMedicationAndInterval = Array.from(medicationIntervalMap.entries())
      .map(([key, data]) => {
        const [medication, intervalLabel] = key.split('|');
        return { medication, intervalLabel, count: data.count, mrr: Math.round(data.mrr) };
      })
      .sort((a, b) => {
        const medCmp = (b.medication === 'Other' ? 0 : 1) - (a.medication === 'Other' ? 0 : 1);
        if (medCmp !== 0) return medCmp;
        const aIdx = intervalOrder.indexOf(a.intervalLabel);
        const bIdx = intervalOrder.indexOf(b.intervalLabel);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx) || b.count - a.count;
      });

    // Recent cancellations
    const recentCancellations = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { canceledAt: 'desc' },
      take: 20,
    });

    // Recent pauses
    const recentPauses = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'PAUSED',
        pausedAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { pausedAt: 'desc' },
      take: 20,
    });

    const retentionRate = Math.round((100 - churnRate) * 10) / 10;

    // LTV: sum of successful payments per patient
    const patientsWithPaymentsList = await prisma.patient.findMany({
      where: clinicFilter,
      select: {
        id: true,
        payments: {
          where: { status: 'SUCCEEDED' },
          select: { amount: true },
        },
      },
    });
    const ltvs = patientsWithPaymentsList.map(
      (p: { id: number; payments: Array<{ amount: number }> }) =>
        p.payments.reduce((sum: number, pay: { amount: number }) => sum + pay.amount, 0)
    );
    const patientsWithPayments = ltvs.filter((v: number) => v > 0).length;
    const totalLTV = ltvs.reduce((a: number, b: number) => a + b, 0);
    const averageLTV = patientsWithPaymentsList.length > 0 ? Math.round(totalLTV / patientsWithPaymentsList.length) : 0;
    const sortedLtvs = [...ltvs].sort((a: number, b: number) => a - b);
    const medianLTV =
      sortedLtvs.length > 0 ? sortedLtvs[Math.floor(sortedLtvs.length / 2)] : 0;

    // Churned in period (full list for MRR, lifetime, reasons)
    const churnedInPeriodList = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        status: 'CANCELED',
        canceledAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        interval: true,
        intervalCount: true,
        startDate: true,
        canceledAt: true,
        metadata: true,
      },
    });

    type ChurnedRow = (typeof churnedInPeriodList)[number];
    const churnedMrr = churnedInPeriodList.reduce(
      (sum: number, s: ChurnedRow) =>
        sum + subscriptionToMonthlyCents(s.amount, s.interval, s.intervalCount || 1),
      0
    );

    const lifetimesDays = churnedInPeriodList
      .filter((s: ChurnedRow) => s.canceledAt && s.startDate)
      .map((s: ChurnedRow) => daysBetween(s.startDate, s.canceledAt!));
    const averageLifetimeBeforeChurnDays =
      lifetimesDays.length > 0
        ? Math.round(
            lifetimesDays.reduce((a: number, b: number) => a + b, 0) / lifetimesDays.length
          )
        : 0;

    const churnReasonMap = new Map<string, { count: number; mrr: number }>();
    churnedInPeriodList.forEach((s: ChurnedRow) => {
      const meta = s.metadata as Record<string, unknown> | null;
      const reason = (meta?.cancelReason as string) || (meta?.cancellation_reason as string) || 'Not specified';
      const mrr = subscriptionToMonthlyCents(s.amount, s.interval, s.intervalCount || 1);
      const existing = churnReasonMap.get(reason);
      if (existing) {
        existing.count += 1;
        existing.mrr += mrr;
      } else {
        churnReasonMap.set(reason, { count: 1, mrr });
      }
    });
    const churnReasons = Array.from(churnReasonMap.entries())
      .map(([reason, data]: [string, { count: number; mrr: number }]) => ({
        reason,
        count: data.count,
        mrr: data.mrr,
        percentageOfTotal:
          churnedInPeriodList.length > 0
            ? Math.round((data.count / churnedInPeriodList.length) * 10000) / 100
            : 0,
      }))
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count);

    // New MRR in period (subscriptions created in period; use current/previous amount as MRR)
    const newSubsInPeriod = await prisma.subscription.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      select: { amount: true, interval: true, intervalCount: true },
    });
    type NewSubRow = (typeof newSubsInPeriod)[number];
    const newMrrInPeriod = newSubsInPeriod.reduce(
      (sum: number, s: NewSubRow) =>
        sum + subscriptionToMonthlyCents(s.amount, s.interval, s.intervalCount || 1),
      0
    );
    const netMrrChange = Math.round(newMrrInPeriod - churnedMrr);

    return {
      totalActiveSubscriptions,
      totalPausedSubscriptions,
      totalCancelledSubscriptions,
      monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue),
      annualRecurringRevenue: Math.round(annualRecurringRevenue),
      averageSubscriptionValue,
      churnRate,
      retentionRate,
      averageLTV,
      medianLTV,
      totalLTV,
      patientsWithPayments,
      churnedMrr: Math.round(churnedMrr),
      newMrrInPeriod: Math.round(newMrrInPeriod),
      netMrrChange,
      averageLifetimeBeforeChurnDays,
      churnReasons,
      subscriptionsByMonth,
      byMedication,
      byInterval,
      byMedicationAndInterval,
      recentCancellations: recentCancellations.map((s: SubscriptionWithPatient) => ({
        patientId: s.patient.id,
        patientName:
          `${safeDecrypt(s.patient.firstName)} ${safeDecrypt(s.patient.lastName)}`.trim(),
        cancelledAt: s.canceledAt!,
        monthsActive: monthsBetween(s.startDate, s.canceledAt || new Date()),
      })),
      recentPauses: recentPauses.map((s: SubscriptionWithPatient) => ({
        patientId: s.patient.id,
        patientName:
          `${safeDecrypt(s.patient.firstName)} ${safeDecrypt(s.patient.lastName)}`.trim(),
        pausedAt: s.pausedAt!,
        resumeAt: s.resumeAt || undefined,
      })),
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
        createdAt: { gte: start, lte: end },
      },
      _count: true,
      _sum: { amount: true },
    });

    let totalPayments = 0;
    let successfulPayments = 0;
    let failedPayments = 0;
    let pendingPayments = 0;
    let refundedPayments = 0;
    let totalAmount = 0;

    paymentCounts.forEach((p: PaymentStatusGroupBy) => {
      totalPayments += p._count;
      if (p.status === 'SUCCEEDED') {
        successfulPayments = p._count;
        totalAmount += p._sum.amount || 0;
      }
      if (p.status === 'FAILED') failedPayments = p._count;
      if (p.status === 'PENDING') pendingPayments = p._count;
      if (p.status === 'REFUNDED') refundedPayments = p._count;
    });

    const paymentSuccessRate =
      totalPayments > 0 ? Math.round((successfulPayments / totalPayments) * 100) : 0;

    const averagePaymentAmount =
      successfulPayments > 0 ? Math.round(totalAmount / successfulPayments) : 0;

    // Payments by method
    const paymentsByMethodRaw = await prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });

    const paymentsByMethod: Record<string, number> = {};
    paymentsByMethodRaw.forEach((p: PaymentMethodGroupBy) => {
      paymentsByMethod[p.paymentMethod || 'unknown'] = p._count;
    });

    // Yesterday's payments
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    );
    const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const yesterdayPaymentsRaw = await prisma.payment.findMany({
      where: {
        ...clinicFilter,
        status: 'SUCCEEDED',
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      include: {
        patient: {
          include: {
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const yesterdayPayments = yesterdayPaymentsRaw.map((p: PaymentWithPatientOrders) => ({
      patientId: p.patient.id,
      patientName: `${safeDecrypt(p.patient.firstName)} ${safeDecrypt(p.patient.lastName)}`.trim(),
      amount: p.amount,
      treatment: p.patient.orders[0]?.primaryMedName || 'Unknown',
      paidAt: p.createdAt,
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
      yesterdayPayments,
    };
  }

  // ==========================================================================
  // TREATMENT METRICS
  // ==========================================================================

  async getTreatmentMetrics(dateRange: DateRangeParams): Promise<TreatmentMetrics> {
    try {
      const clinicFilter = this.getClinicFilter();
      const now = new Date();

      // Get all active subscriptions with patient info
      const subscriptions = await prisma.subscription.findMany({
        where: {
          ...clinicFilter,
          status: 'ACTIVE',
        },
        include: {
          patient: true,
        },
      });

      // Group by treatment month
      const patientsByTreatmentMonth: Record<number, number> = {};
      const patientsOnMonth: Array<{
        month: number;
        count: number;
        patients: Array<{ id: number; name: string; startDate: Date; treatment: string }>;
      }> = [];

      const monthGroups = new Map<
        number,
        Array<{ id: number; name: string; startDate: Date; treatment: string }>
      >();

      subscriptions.forEach((s: SubscriptionWithPatientFull) => {
        const months = monthsBetween(s.startDate, now) + 1;
        patientsByTreatmentMonth[months] = (patientsByTreatmentMonth[months] || 0) + 1;

        if (!monthGroups.has(months)) {
          monthGroups.set(months, []);
        }
        monthGroups.get(months)!.push({
          id: s.patient.id,
          name: `${safeDecrypt(s.patient.firstName)} ${safeDecrypt(s.patient.lastName)}`.trim(),
          startDate: s.startDate,
          treatment: s.planName,
        });
      });

      monthGroups.forEach((patients: PatientOnMonthEntry[], month: number) => {
        patientsOnMonth.push({
          month,
          count: patients.length,
          patients,
        });
      });
      patientsOnMonth.sort((a: PatientsOnMonthGroup, b: PatientsOnMonthGroup) => a.month - b.month);

      // Treatment completion rate (completed subscriptions / total ended)
      const completedSubscriptions = await prisma.subscription.count({
        where: {
          ...clinicFilter,
          status: 'EXPIRED',
          endedAt: { not: null },
        },
      });

      const totalEndedSubscriptions = await prisma.subscription.count({
        where: {
          ...clinicFilter,
          OR: [{ status: 'EXPIRED' }, { status: 'CANCELED' }],
        },
      });

      const treatmentCompletionRate =
        totalEndedSubscriptions > 0
          ? Math.round((completedSubscriptions / totalEndedSubscriptions) * 100)
          : 0;

      // Average treatment duration
      const endedSubscriptions = await prisma.subscription.findMany({
        where: {
          ...clinicFilter,
          endedAt: { not: null },
        },
        select: { startDate: true, endedAt: true },
      });

      const durations = endedSubscriptions.map((s: SubscriptionEndedSelect) =>
        monthsBetween(s.startDate, s.endedAt!)
      );
      const averageTreatmentDuration =
        durations.length > 0
          ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
          : 0;

      // Treatments by type
      const treatmentsByType: Record<string, number> = {};
      const orders = await prisma.order.groupBy({
        by: ['primaryMedName'],
        where: clinicFilter,
        _count: true,
      });

      orders.forEach((o: OrderMedicationGroupBy) => {
        treatmentsByType[o.primaryMedName || 'Unknown'] = o._count;
      });

      return {
        patientsByTreatmentMonth,
        treatmentCompletionRate,
        averageTreatmentDuration,
        treatmentsByType,
        patientsOnMonth,
      };
    } catch (error) {
      logger.error('Error in getTreatmentMetrics', error as Error);
      // Return empty metrics on error
      return {
        patientsByTreatmentMonth: {},
        treatmentCompletionRate: 0,
        averageTreatmentDuration: 0,
        treatmentsByType: {},
        patientsOnMonth: [],
      };
    }
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
        createdAt: { gte: start, lte: end },
      },
    });

    // Orders by status
    const ordersByStatusRaw = await prisma.order.groupBy({
      by: ['status'],
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });

    const ordersByStatus: Record<string, number> = {};
    let pendingOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;

    ordersByStatusRaw.forEach((o: OrderStatusGroupBy) => {
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
        createdAt: { gte: start, lte: end },
      },
      _count: true,
    });

    const ordersByMedication: Record<string, number> = {};
    ordersByMedicationRaw.forEach((o: OrderMedicationGroupBy) => {
      ordersByMedication[o.primaryMedName || 'Unknown'] = o._count;
    });

    // Average order value (from related payments)
    const ordersWithPayments = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          include: {
            payments: {
              where: { status: 'SUCCEEDED' },
            },
          },
        },
      },
    });

    const orderValues = ordersWithPayments
      .map((o: OrderWithPatientPayments) =>
        o.patient.payments.reduce((sum: number, p: Payment) => sum + p.amount, 0)
      )
      .filter((v: number) => v > 0);

    const averageOrderValue =
      orderValues.length > 0
        ? Math.round(orderValues.reduce((a: number, b: number) => a + b, 0) / orderValues.length)
        : 0;

    // Average fulfillment time (from created to shipped)
    const fulfilledOrders = await prisma.order.findMany({
      where: {
        ...clinicFilter,
        createdAt: { gte: start, lte: end },
        shippingStatus: { not: null },
      },
      select: { createdAt: true, lastWebhookAt: true },
    });

    const fulfillmentTimes = fulfilledOrders
      .filter((o: OrderFulfillmentSelect) => o.lastWebhookAt)
      .map(
        (o: OrderFulfillmentSelect) =>
          (o.lastWebhookAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60)
      ); // hours

    const averageFulfillmentTime =
      fulfillmentTimes.length > 0
        ? Math.round(
            fulfillmentTimes.reduce((a: number, b: number) => a + b, 0) / fulfillmentTimes.length
          )
        : 0;

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      averageOrderValue,
      ordersByStatus,
      ordersByMedication,
      averageFulfillmentTime,
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
      end: end.toISOString(),
    });

    const [patients, revenue, subscriptions, payments, treatments, orders] = await Promise.all([
      this.getPatientMetrics(dateRange),
      this.getRevenueMetrics(dateRange),
      this.getSubscriptionMetrics(dateRange),
      this.getPaymentMetrics(dateRange),
      this.getTreatmentMetrics(dateRange),
      this.getOrderMetrics(dateRange),
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
      orders,
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
        createdAt: { gte: start, lte: end },
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
              select: { planName: true, startDate: true, amount: true },
            },
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { primaryMedName: true, primaryMedStrength: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
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
        status: 'ACTIVE',
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return subscriptions
      .filter((s: SubscriptionWithPatient) => {
        const months = monthsBetween(s.startDate, now) + 1;
        return months === month;
      })
      .map((s: SubscriptionWithPatient) => ({
        ...s.patient,
        subscriptionId: s.id,
        planName: s.planName,
        startDate: s.startDate,
        monthsActive: month,
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
        canceledAt: { gte: start, lte: end },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { canceledAt: 'desc' },
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
        status: 'PAUSED',
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { pausedAt: 'desc' },
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
        status: 'ACTIVE',
      },
      select: {
        amount: true,
        interval: true,
        intervalCount: true,
        planName: true,
      },
    });

    const byPlan: Record<string, { count: number; mrr: number }> = {};

    subscriptions.forEach((s: SubscriptionPlanSelect) => {
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

    const totalMRR = Object.values(byPlan).reduce(
      (sum: number, p: PlanBreakdown) => sum + p.mrr,
      0
    );

    return {
      totalMRR: Math.round(totalMRR),
      totalARR: Math.round(totalMRR * 12),
      byPlan,
      subscriptionCount: subscriptions.length,
    };
  }
}

// Export singleton for convenience
export const reportingService = new ReportingService();
