/**
 * Admin Clinic Stats API
 *
 * Provides clinic statistics and usage metrics.
 * Uses runWithClinicContext + prisma (not basePrisma) so Order, Ticket, ClinicAuditLog
 * are allowed in production (clinic-scoped access only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/clinic/stats
 * Get statistics for the current clinic
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const clinicId = user.clinicId;

      return await runWithClinicContext(clinicId, async () => {
        try {
          const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get counts in parallel (prisma applies clinic filter in this context)
        // Batched in groups of 3 to stay within the 3-connection serverless pool limit.
        // Previously 15 parallel queries caused P2024 pool exhaustion under load.
        const [clinic, totalPatients, activePatients] = await Promise.all([
          prisma.clinic.findUnique({
            where: { id: clinicId },
            select: {
              id: true,
              name: true,
              patientLimit: true,
              providerLimit: true,
              storageLimit: true,
              billingPlan: true,
              createdAt: true,
            },
          }),
          prisma.patient.count({ where: { clinicId } }),
          prisma.patient.count({
            where: {
              clinicId,
              orders: { some: { createdAt: { gte: thirtyDaysAgo } } },
            },
          }),
        ]);

        const [newPatientsThisMonth, totalUsers, activeUsers] = await Promise.all([
          prisma.patient.count({
            where: { clinicId, createdAt: { gte: thirtyDaysAgo } },
          }),
          prisma.user.count({
            where: {
              OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
            },
          }),
          prisma.user.count({
            where: {
              OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
              lastLogin: { gte: sevenDaysAgo },
            },
          }),
        ]);

        const [totalProviders, totalOrders, ordersThisMonth] = await Promise.all([
          prisma.user.count({
            where: {
              OR: [
                { clinicId, role: 'PROVIDER' },
                { userClinics: { some: { clinicId, isActive: true, role: 'PROVIDER' } } },
              ],
            },
          }),
          prisma.order.count({ where: { clinicId } }),
          prisma.order.count({
            where: { clinicId, createdAt: { gte: thirtyDaysAgo } },
          }),
        ]);

        const [pendingOrders, completedOrders, totalTickets] = await Promise.all([
          prisma.order.count({
            where: {
              clinicId,
              status: { in: ['pending', 'processing', 'awaiting_prescription'] },
            },
          }),
          prisma.order.count({ where: { clinicId, status: 'completed' } }),
          prisma.ticket.count({ where: { clinicId } }),
        ]);

        const [openTickets, recentAuditLogs, userActivity] = await Promise.all([
          prisma.ticket.count({
            where: {
              clinicId,
              status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
            },
          }),
          prisma.clinicAuditLog.count({
            where: { clinicId, createdAt: { gte: sevenDaysAgo } },
          }),
          prisma.user.findMany({
            where: {
              OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
              lastLogin: { gte: sevenDaysAgo },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              lastLogin: true,
            },
            orderBy: { lastLogin: 'desc' },
            take: 10,
          }),
        ]);

        if (!clinic) {
          return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
        }

        // Calculate usage percentages
        const patientUsage =
          clinic.patientLimit > 0 ? Math.round((totalPatients / clinic.patientLimit) * 100) : 0;
        const providerUsage =
          clinic.providerLimit > 0 ? Math.round((totalProviders / clinic.providerLimit) * 100) : 0;

        return NextResponse.json({
          clinic: {
            id: clinic.id,
            name: clinic.name,
            billingPlan: clinic.billingPlan,
            createdAt: clinic.createdAt,
          },
          patients: {
            total: totalPatients,
            active: activePatients,
            newThisMonth: newPatientsThisMonth,
            limit: clinic.patientLimit,
            usagePercent: patientUsage,
          },
          users: {
            total: totalUsers,
            active: activeUsers,
            providers: totalProviders,
            providerLimit: clinic.providerLimit,
            providerUsagePercent: providerUsage,
          },
          orders: {
            total: totalOrders,
            thisMonth: ordersThisMonth,
            pending: pendingOrders,
            completed: completedOrders,
          },
          support: {
            totalTickets,
            openTickets,
          },
          activity: {
            auditLogsThisWeek: recentAuditLogs,
            recentUsers: userActivity,
          },
          storage: {
            limit: clinic.storageLimit,
            // TODO: Calculate actual storage usage
            used: 0,
            usagePercent: 0,
          },
        });
        } catch (innerError) {
          logger.error('Error inside clinic stats context:', {
            error: innerError instanceof Error ? innerError.message : String(innerError),
            stack: innerError instanceof Error ? innerError.stack : undefined,
            userId: user.id,
            clinicId: user.clinicId,
          });
          throw innerError;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const code = error instanceof Error && 'code' in error ? (error as { code?: string }).code : undefined;
      logger.error('Error fetching clinic stats:', {
        error: message,
        code,
        ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
        userId: user.id,
        clinicId: user.clinicId,
      });
      return NextResponse.json(
        {
          error: 'Failed to fetch statistics',
          ...(process.env.NODE_ENV === 'development' && { detail: message, code }),
        },
        { status: 500 }
      );
    }
  },
  { roles: ['admin', 'super_admin'] }
);
