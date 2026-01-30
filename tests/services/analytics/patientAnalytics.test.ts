/**
 * Patient Analytics Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatientAnalyticsService } from '@/services/analytics/patientAnalytics';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
  withClinicContext: vi.fn((clinicId, callback) => callback()),
  getClinicContext: vi.fn(() => 1),
}));

describe('PatientAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPatientLTV', () => {
    it('should calculate patient lifetime value correctly', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.patient.findFirst as any).mockResolvedValue({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        createdAt: new Date('2024-01-01'),
      });

      (prisma.payment.findMany as any).mockResolvedValue([
        { amount: 10000, createdAt: new Date('2024-01-15') },
        { amount: 20000, createdAt: new Date('2024-02-15') },
      ]);

      (prisma.subscription.findFirst as any).mockResolvedValue({
        status: 'ACTIVE',
      });

      const result = await PatientAnalyticsService.getPatientLTV(1, 1);

      expect(result).not.toBeNull();
      expect(result?.totalRevenue).toBe(30000);
      expect(result?.paymentCount).toBe(2);
      expect(result?.subscriptionStatus).toBe('ACTIVE');
    });

    it('should return null for non-existent patient', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.patient.findFirst as any).mockResolvedValue(null);

      const result = await PatientAnalyticsService.getPatientLTV(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('getPatientSegments', () => {
    it('should segment patients by revenue', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.patient.findMany as any).mockResolvedValue([
        { id: 1, payments: [{ amount: 150000 }] }, // VIP
        { id: 2, payments: [{ amount: 50000 }] },  // Regular
        { id: 3, payments: [{ amount: 10000 }] },  // Occasional
        { id: 4, payments: [{ amount: 2000 }] },   // New
      ]);

      const result = await PatientAnalyticsService.getPatientSegments(1);

      expect(result).toHaveLength(4);
      expect(result.find(s => s.segment === 'VIP')?.count).toBe(1);
      expect(result.find(s => s.segment === 'Regular')?.count).toBe(1);
      expect(result.find(s => s.segment === 'Occasional')?.count).toBe(1);
      expect(result.find(s => s.segment === 'New')?.count).toBe(1);
    });
  });

  describe('getAtRiskPatients', () => {
    it('should identify at-risk patients', async () => {
      const { prisma } = await import('@/lib/db');
      
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      (prisma.patient.findMany as any).mockResolvedValue([
        {
          id: 1,
          firstName: 'At',
          lastName: 'Risk',
          email: 'atrisk@example.com',
          createdAt: new Date('2024-01-01'),
          payments: [{ createdAt: sixtyDaysAgo }],
          subscriptions: [{ status: 'PAST_DUE' }],
        },
      ]);

      (prisma.payment.count as any).mockResolvedValue(2);
      (prisma.payment.aggregate as any).mockResolvedValue({
        _sum: { amount: 50000 },
      });

      const result = await PatientAnalyticsService.getAtRiskPatients(1, 10);

      expect(Array.isArray(result)).toBe(true);
      result.forEach(patient => {
        expect(patient).toHaveProperty('riskScore');
        expect(patient).toHaveProperty('riskFactors');
        expect(patient.riskScore).toBeGreaterThan(0);
      });
    });
  });

  describe('getPaymentBehavior', () => {
    it('should analyze payment behavior', async () => {
      const { prisma } = await import('@/lib/db');
      
      const dueDate = new Date('2024-01-15');
      
      (prisma.payment.findMany as any).mockResolvedValue([
        { status: 'SUCCEEDED', createdAt: new Date('2024-01-14'), invoice: { dueDate } }, // On time
        { status: 'SUCCEEDED', createdAt: new Date('2024-01-20'), invoice: { dueDate } }, // Late
        { status: 'FAILED', createdAt: new Date('2024-01-16'), invoice: { dueDate } },   // Failed
      ]);

      const result = await PatientAnalyticsService.getPaymentBehavior(1);

      expect(result).toHaveProperty('onTimePayments');
      expect(result).toHaveProperty('latePayments');
      expect(result).toHaveProperty('failedPayments');
      expect(result).toHaveProperty('onTimePercentage');
      expect(result.onTimePayments).toBe(1);
      expect(result.latePayments).toBe(1);
      expect(result.failedPayments).toBe(1);
    });
  });

  describe('getRetentionMatrix', () => {
    it('should generate retention matrix', async () => {
      const result = await PatientAnalyticsService.getRetentionMatrix(1, 6);

      expect(result).toHaveProperty('months');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('averageRetention');
      expect(Array.isArray(result.data)).toBe(true);
      expect(Array.isArray(result.averageRetention)).toBe(true);
    });
  });

  describe('getPatientMetrics', () => {
    it('should return aggregate patient metrics', async () => {
      const { prisma } = await import('@/lib/db');
      
      (prisma.patient.findMany as any).mockResolvedValue([
        { id: 1, payments: [{ amount: 50000 }] },
        { id: 2, payments: [{ amount: 30000 }] },
        { id: 3, payments: [] },
      ]);

      (prisma.subscription.count as any)
        .mockResolvedValueOnce(2) // active
        .mockResolvedValueOnce(1); // churned

      const result = await PatientAnalyticsService.getPatientMetrics(1);

      expect(result).toHaveProperty('totalPatients');
      expect(result).toHaveProperty('patientsWithPayments');
      expect(result).toHaveProperty('averageLTV');
      expect(result).toHaveProperty('churnRate');
      expect(result.totalPatients).toBe(3);
      expect(result.patientsWithPayments).toBe(2);
    });
  });
});
