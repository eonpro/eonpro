/**
 * Patient Analytics Service
 * 
 * Provides patient payment analytics, LTV calculations, cohort analysis,
 * and retention metrics.
 */

import { prisma, withClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { 
  startOfMonth, 
  endOfMonth,
  subMonths, 
  format,
  differenceInMonths,
  eachMonthOfInterval,
} from 'date-fns';
import type { DateRange } from './revenueAnalytics';
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

// Types
export interface PatientLTV {
  patientId: number;
  patientName: string;
  totalRevenue: number;
  paymentCount: number;
  firstPaymentDate: Date | null;
  lastPaymentDate: Date | null;
  monthsActive: number;
  averageMonthlySpend: number;
  subscriptionStatus: string | null;
  predictedLTV: number;
}

export interface CohortData {
  cohort: string; // YYYY-MM format
  size: number; // Number of patients in cohort
  retention: Record<number, number>; // Month number -> % retained
  revenue: Record<number, number>; // Month number -> total revenue
  averageLTV: number;
}

export interface RetentionMatrix {
  months: string[]; // Cohort months
  data: Array<{
    cohort: string;
    size: number;
    retention: number[]; // Percentage retained each month
  }>;
  averageRetention: number[];
}

export interface PaymentBehavior {
  onTimePayments: number;
  latePayments: number;
  failedPayments: number;
  onTimePercentage: number;
  latePercentage: number;
  failedPercentage: number;
  averagePaymentDelay: number; // Days
}

export interface AtRiskPatient {
  patientId: number;
  patientName: string;
  email: string;
  riskScore: number; // 0-100
  riskFactors: string[];
  lastPaymentDate: Date | null;
  lastActivityDate: Date | null;
  subscriptionStatus: string | null;
  totalRevenue: number;
}

export interface PatientSegment {
  segment: string;
  count: number;
  totalRevenue: number;
  averageLTV: number;
  percentageOfTotal: number;
}

export interface PatientFinancialProfile {
  patient: {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
  };
  summary: {
    totalRevenue: number;
    totalPayments: number;
    outstandingBalance: number;
    lifetimeValue: number;
    averageOrderValue: number;
  };
  payments: Array<{
    id: number;
    amount: number;
    status: string;
    date: Date;
    method: string | null;
  }>;
  subscriptions: Array<{
    id: number;
    status: string;
    planName: string | null;
    amount: number;
    startDate: Date;
    endDate: Date | null;
  }>;
  invoices: Array<{
    id: number;
    status: string;
    amount: number;
    dueDate: Date | null;
    paidAt: Date | null;
  }>;
}

/**
 * Patient Analytics Service
 */
export class PatientAnalyticsService {
  /**
   * Calculate lifetime value for a specific patient
   */
  static async getPatientLTV(
    clinicId: number,
    patientId: number
  ): Promise<PatientLTV | null> {
    return withClinicContext(clinicId, async () => {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      });

      if (!patient) return null;

      // Get all payments for this patient
      const payments = await prisma.payment.findMany({
        where: {
          patientId,
          clinicId,
          status: 'SUCCEEDED',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          amount: true,
          createdAt: true,
        },
      });

      const totalRevenue = payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      const firstPayment = payments[0]?.createdAt || null;
      const lastPayment = payments[payments.length - 1]?.createdAt || null;
      
      const monthsActive = firstPayment && lastPayment 
        ? Math.max(1, differenceInMonths(lastPayment, firstPayment) + 1)
        : 0;
      
      const avgMonthlySpend = monthsActive > 0 
        ? Math.round(totalRevenue / monthsActive)
        : 0;

      // Get subscription status
      const subscription = await prisma.subscription.findFirst({
        where: { patientId, clinicId },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });

      // Predict future LTV (simple model: avg monthly * expected lifetime)
      const expectedLifetimeMonths = 24; // Default assumption
      const predictedLTV = avgMonthlySpend * expectedLifetimeMonths;

      return {
        patientId: patient.id,
        patientName: `${safeDecrypt(patient.firstName)} ${safeDecrypt(patient.lastName)}`.trim(),
        totalRevenue,
        paymentCount: payments.length,
        firstPaymentDate: firstPayment,
        lastPaymentDate: lastPayment,
        monthsActive,
        averageMonthlySpend: avgMonthlySpend,
        subscriptionStatus: subscription?.status || null,
        predictedLTV,
      };
    });
  }

  /**
   * Get cohort analysis by signup month or first payment
   */
  static async getCohortAnalysis(
    clinicId: number,
    cohortBy: 'signup' | 'firstPayment' = 'signup',
    dateRange?: DateRange
  ): Promise<CohortData[]> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const rangeStart = dateRange?.start || subMonths(now, 12);
      const rangeEnd = dateRange?.end || now;

      // Get all patients with payments
      const patients = await prisma.patient.findMany({
        where: { clinicId },
        select: {
          id: true,
          createdAt: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'asc' },
            select: {
              amount: true,
              createdAt: true,
            },
          },
        },
      });

      // Group patients into cohorts
      const cohortMap = new Map<string, {
        patientIds: number[];
        payments: Array<{ patientId: number; amount: number; date: Date }>;
      }>();

      patients.forEach((patient: typeof patients[number]) => {
        if (patient.payments.length === 0) return;

        const cohortDate = cohortBy === 'signup' 
          ? patient.createdAt 
          : patient.payments[0].createdAt;

        // Filter to date range
        if (cohortDate < rangeStart || cohortDate > rangeEnd) return;

        const cohortKey = format(cohortDate, 'yyyy-MM');
        const existing = cohortMap.get(cohortKey);

        const patientPayments = patient.payments.map((p: { amount: number; createdAt: Date }) => ({
          patientId: patient.id,
          amount: p.amount,
          date: new Date(p.createdAt),
        }));

        if (existing) {
          existing.patientIds.push(patient.id);
          existing.payments.push(...patientPayments);
        } else {
          cohortMap.set(cohortKey, {
            patientIds: [patient.id],
            payments: patientPayments,
          });
        }
      });

      // Calculate retention and revenue for each cohort
      const cohorts: CohortData[] = [];

      for (const [cohortKey, data] of cohortMap.entries()) {
        const cohortStartDate = new Date(cohortKey + '-01');
        const monthsSinceCohort = differenceInMonths(now, cohortStartDate);

        const retention: Record<number, number> = {};
        const revenue: Record<number, number> = {};

        // Calculate metrics for each month since cohort start
        for (let month = 0; month <= Math.min(monthsSinceCohort, 12); month++) {
          const monthStart = startOfMonth(subMonths(now, monthsSinceCohort - month));
          const monthEnd = endOfMonth(monthStart);

          // Find unique patients with payments in this month
          const activePatients = new Set(
            data.payments
              .filter((p: { date: Date }) => p.date >= monthStart && p.date <= monthEnd)
              .map((p: { patientId: number }) => p.patientId)
          );

          retention[month] = data.patientIds.length > 0
            ? Math.round((activePatients.size / data.patientIds.length) * 100)
            : 0;

          revenue[month] = data.payments
            .filter((p: { date: Date }) => p.date >= monthStart && p.date <= monthEnd)
            .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        }

        const totalRevenue = data.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

        cohorts.push({
          cohort: cohortKey,
          size: data.patientIds.length,
          retention,
          revenue,
          averageLTV: data.patientIds.length > 0
            ? Math.round(totalRevenue / data.patientIds.length)
            : 0,
        });
      }

      return cohorts.sort((a, b) => a.cohort.localeCompare(b.cohort));
    });
  }

  /**
   * Generate retention matrix for visualization
   */
  static async getRetentionMatrix(
    clinicId: number,
    months: number = 12
  ): Promise<RetentionMatrix> {
    const cohorts = await this.getCohortAnalysis(clinicId, 'signup', {
      start: subMonths(new Date(), months),
      end: new Date(),
    });

    const monthLabels = cohorts.map(c => c.cohort);
    const maxRetentionMonths = 13; // Month 0 through 12

    const data = cohorts.map(cohort => ({
      cohort: cohort.cohort,
      size: cohort.size,
      retention: Array.from({ length: maxRetentionMonths }, (_, i) => cohort.retention[i] || 0),
    }));

    // Calculate average retention for each month
    const averageRetention = Array.from({ length: maxRetentionMonths }, (_, monthIndex) => {
      const retentionValues = data
        .map(d => d.retention[monthIndex])
        .filter(v => v > 0);
      
      return retentionValues.length > 0
        ? Math.round(retentionValues.reduce((a: number, b: number) => a + b, 0) / retentionValues.length)
        : 0;
    });

    return {
      months: monthLabels,
      data,
      averageRetention,
    };
  }

  /**
   * Analyze payment behavior patterns
   */
  static async getPaymentBehavior(
    clinicId: number,
    dateRange?: DateRange
  ): Promise<PaymentBehavior> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const start = dateRange?.start || subMonths(now, 12);
      const end = dateRange?.end || now;

      // Get payments with invoice info
      const payments = await prisma.payment.findMany({
        where: {
          clinicId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          invoice: {
            select: {
              dueDate: true,
            },
          },
        },
      });

      let onTime = 0;
      let late = 0;
      let failed = 0;
      let totalDelay = 0;
      let delayCount = 0;

      payments.forEach((payment: typeof payments[number]) => {
        if (payment.status === 'FAILED') {
          failed++;
          return;
        }

        if (payment.status !== 'SUCCEEDED') return;

        if (payment.invoice?.dueDate) {
          const dueDate = new Date(payment.invoice.dueDate);
          const paymentDate = new Date(payment.createdAt);
          const daysDiff = Math.floor(
            (paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysDiff <= 0) {
            onTime++;
          } else {
            late++;
            totalDelay += daysDiff;
            delayCount++;
          }
        } else {
          // No due date, assume on time
          onTime++;
        }
      });

      const total = onTime + late + failed;

      return {
        onTimePayments: onTime,
        latePayments: late,
        failedPayments: failed,
        onTimePercentage: total > 0 ? Math.round((onTime / total) * 100) : 0,
        latePercentage: total > 0 ? Math.round((late / total) * 100) : 0,
        failedPercentage: total > 0 ? Math.round((failed / total) * 100) : 0,
        averagePaymentDelay: delayCount > 0 ? Math.round(totalDelay / delayCount) : 0,
      };
    });
  }

  /**
   * Identify patients at risk of churning
   */
  static async getAtRiskPatients(
    clinicId: number,
    limit: number = 20
  ): Promise<AtRiskPatient[]> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const thirtyDaysAgo = subMonths(now, 1);
      const sixtyDaysAgo = subMonths(now, 2);
      const ninetyDaysAgo = subMonths(now, 3);

      // Get patients with their payment and subscription data
      const patients = await prisma.patient.findMany({
        where: { clinicId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, amount: true },
          },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, canceledAt: true },
          },
        },
      });

      const atRiskPatients: AtRiskPatient[] = [];

      for (const patient of patients) {
        const riskFactors: string[] = [];
        let riskScore = 0;

        const lastPayment = patient.payments[0]?.createdAt;
        const subscription = patient.subscriptions[0];

        // Risk factor: Subscription canceled
        if (subscription?.status === 'CANCELED') {
          riskFactors.push('Subscription canceled');
          riskScore += 50;
        } else if (subscription?.status === 'PAST_DUE') {
          riskFactors.push('Payment past due');
          riskScore += 40;
        } else if (subscription?.status === 'PAUSED') {
          riskFactors.push('Subscription paused');
          riskScore += 30;
        }

        // Risk factor: No recent payment
        if (lastPayment) {
          if (lastPayment < ninetyDaysAgo) {
            riskFactors.push('No payment in 90+ days');
            riskScore += 30;
          } else if (lastPayment < sixtyDaysAgo) {
            riskFactors.push('No payment in 60+ days');
            riskScore += 20;
          } else if (lastPayment < thirtyDaysAgo) {
            riskFactors.push('No payment in 30+ days');
            riskScore += 10;
          }
        } else {
          riskFactors.push('No payment history');
          riskScore += 25;
        }

        // Risk factor: Failed payments
        const recentFailedPayments = await prisma.payment.count({
          where: {
            patientId: patient.id,
            clinicId,
            status: 'FAILED',
            createdAt: { gte: thirtyDaysAgo },
          },
        });

        if (recentFailedPayments > 2) {
          riskFactors.push('Multiple failed payments');
          riskScore += 25;
        } else if (recentFailedPayments > 0) {
          riskFactors.push('Recent failed payment');
          riskScore += 15;
        }

        // Only include if there's actual risk
        if (riskScore > 20) {
          const totalRevenue = await prisma.payment.aggregate({
            where: {
              patientId: patient.id,
              clinicId,
              status: 'SUCCEEDED',
            },
            _sum: { amount: true },
          });

          atRiskPatients.push({
            patientId: patient.id,
            patientName: `${safeDecrypt(patient.firstName)} ${safeDecrypt(patient.lastName)}`.trim(),
            email: safeDecrypt(patient.email),
            riskScore: Math.min(100, riskScore),
            riskFactors,
            lastPaymentDate: lastPayment || null,
            lastActivityDate: lastPayment || patient.createdAt,
            subscriptionStatus: subscription?.status || null,
            totalRevenue: totalRevenue._sum.amount || 0,
          });
        }
      }

      // Sort by risk score and limit results
      return atRiskPatients
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, limit);
    });
  }

  /**
   * Segment patients by value or behavior
   */
  static async getPatientSegments(clinicId: number): Promise<PatientSegment[]> {
    return withClinicContext(clinicId, async () => {
      const patients = await prisma.patient.findMany({
        where: { clinicId },
        select: {
          id: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            select: { amount: true },
          },
        },
      });

      const segments = {
        vip: { count: 0, revenue: 0, threshold: 100000 }, // > $1000
        regular: { count: 0, revenue: 0, threshold: 20000 }, // $200-$1000
        occasional: { count: 0, revenue: 0, threshold: 5000 }, // $50-$200
        new: { count: 0, revenue: 0, threshold: 0 }, // < $50
      };

      let totalPatients = 0;
      let totalRevenue = 0;

      patients.forEach((patient: typeof patients[number]) => {
        const revenue = patient.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        totalPatients++;
        totalRevenue += revenue;

        if (revenue >= segments.vip.threshold) {
          segments.vip.count++;
          segments.vip.revenue += revenue;
        } else if (revenue >= segments.regular.threshold) {
          segments.regular.count++;
          segments.regular.revenue += revenue;
        } else if (revenue >= segments.occasional.threshold) {
          segments.occasional.count++;
          segments.occasional.revenue += revenue;
        } else {
          segments.new.count++;
          segments.new.revenue += revenue;
        }
      });

      return [
        {
          segment: 'VIP',
          count: segments.vip.count,
          totalRevenue: segments.vip.revenue,
          averageLTV: segments.vip.count > 0 
            ? Math.round(segments.vip.revenue / segments.vip.count)
            : 0,
          percentageOfTotal: totalPatients > 0
            ? Math.round((segments.vip.count / totalPatients) * 100)
            : 0,
        },
        {
          segment: 'Regular',
          count: segments.regular.count,
          totalRevenue: segments.regular.revenue,
          averageLTV: segments.regular.count > 0
            ? Math.round(segments.regular.revenue / segments.regular.count)
            : 0,
          percentageOfTotal: totalPatients > 0
            ? Math.round((segments.regular.count / totalPatients) * 100)
            : 0,
        },
        {
          segment: 'Occasional',
          count: segments.occasional.count,
          totalRevenue: segments.occasional.revenue,
          averageLTV: segments.occasional.count > 0
            ? Math.round(segments.occasional.revenue / segments.occasional.count)
            : 0,
          percentageOfTotal: totalPatients > 0
            ? Math.round((segments.occasional.count / totalPatients) * 100)
            : 0,
        },
        {
          segment: 'New',
          count: segments.new.count,
          totalRevenue: segments.new.revenue,
          averageLTV: segments.new.count > 0
            ? Math.round(segments.new.revenue / segments.new.count)
            : 0,
          percentageOfTotal: totalPatients > 0
            ? Math.round((segments.new.count / totalPatients) * 100)
            : 0,
        },
      ];
    });
  }

  /**
   * Get complete financial profile for a patient
   */
  static async getPatientFinancialProfile(
    clinicId: number,
    patientId: number
  ): Promise<PatientFinancialProfile | null> {
    return withClinicContext(clinicId, async () => {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              amount: true,
              status: true,
              createdAt: true,
              paymentMethod: true,
            },
          },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              planName: true,
              amount: true,
              createdAt: true,
              canceledAt: true,
            },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              status: true,
              total: true,
              dueDate: true,
              paidAt: true,
            },
          },
        },
      });

      if (!patient) return null;

      // Calculate summary metrics
      const successfulPayments = patient.payments.filter((p: { status: string }) => p.status === 'SUCCEEDED');
      const totalRevenue = successfulPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      
      const outstandingInvoices = patient.invoices.filter(
        (inv: { status: string }) => inv.status === 'OPEN' || inv.status === 'DRAFT'
      );
      const outstandingBalance = outstandingInvoices.reduce(
        (sum: number, inv: { total: number }) => sum + inv.total, 0
      );

      const monthsActive = differenceInMonths(new Date(), patient.createdAt) || 1;
      const lifetimeValue = totalRevenue;
      const avgOrderValue = successfulPayments.length > 0
        ? Math.round(totalRevenue / successfulPayments.length)
        : 0;

      return {
        patient: {
          id: patient.id,
          name: `${safeDecrypt(patient.firstName)} ${safeDecrypt(patient.lastName)}`.trim(),
          email: safeDecrypt(patient.email),
          createdAt: patient.createdAt,
        },
        summary: {
          totalRevenue,
          totalPayments: successfulPayments.length,
          outstandingBalance,
          lifetimeValue,
          averageOrderValue: avgOrderValue,
        },
        payments: patient.payments.map((p: typeof patient.payments[number]) => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          date: p.createdAt,
          method: p.paymentMethod,
        })),
        subscriptions: patient.subscriptions.map((s: typeof patient.subscriptions[number]) => ({
          id: s.id,
          status: s.status,
          planName: s.planName,
          amount: s.amount,
          startDate: s.createdAt,
          endDate: s.canceledAt,
        })),
        invoices: patient.invoices.map((inv: typeof patient.invoices[number]) => ({
          id: inv.id,
          status: inv.status,
          amount: inv.total,
          dueDate: inv.dueDate,
          paidAt: inv.paidAt,
        })),
      };
    });
  }

  /**
   * Get aggregate patient metrics for dashboard
   */
  static async getPatientMetrics(clinicId: number): Promise<{
    totalPatients: number;
    patientsWithPayments: number;
    averageLTV: number;
    medianLTV: number;
    totalLTV: number;
    activeSubscriptions: number;
    churnedLast30Days: number;
    churnRate: number;
  }> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const thirtyDaysAgo = subMonths(now, 1);

      // Get all patients with payment totals
      const patients = await prisma.patient.findMany({
        where: { clinicId },
        select: {
          id: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            select: { amount: true },
          },
        },
      });

      const ltvs = patients.map((p: typeof patients[number]) => 
        p.payments.reduce((sum: number, pay: { amount: number }) => sum + pay.amount, 0)
      );
      
      const patientsWithPayments = ltvs.filter((ltv: number) => ltv > 0).length;
      const totalLTV = ltvs.reduce((a: number, b: number) => a + b, 0);
      const averageLTV = patients.length > 0 
        ? Math.round(totalLTV / patients.length)
        : 0;

      // Calculate median
      const sortedLTVs = [...ltvs].sort((a, b) => a - b);
      const medianLTV = sortedLTVs.length > 0
        ? sortedLTVs[Math.floor(sortedLTVs.length / 2)]
        : 0;

      // Active subscriptions
      const activeSubscriptions = await prisma.subscription.count({
        where: { clinicId, status: 'ACTIVE' },
      });

      // Churned in last 30 days
      const churnedLast30Days = await prisma.subscription.count({
        where: {
          clinicId,
          status: 'CANCELED',
          canceledAt: { gte: thirtyDaysAgo },
        },
      });

      // Calculate churn rate (churned / (active + churned))
      const churnRate = (activeSubscriptions + churnedLast30Days) > 0
        ? Math.round((churnedLast30Days / (activeSubscriptions + churnedLast30Days)) * 10000) / 100
        : 0;

      return {
        totalPatients: patients.length,
        patientsWithPayments,
        averageLTV,
        medianLTV,
        totalLTV,
        activeSubscriptions,
        churnedLast30Days,
        churnRate,
      };
    });
  }
}
