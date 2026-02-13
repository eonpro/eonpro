/**
 * Admin Clinic Stats API
 *
 * Provides clinic statistics and usage metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
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
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get counts in parallel
      const [
        clinic,
        totalPatients,
        activePatients,
        newPatientsThisMonth,
        totalUsers,
        activeUsers,
        totalProviders,
        totalOrders,
        ordersThisMonth,
        pendingOrders,
        completedOrders,
        totalTickets,
        openTickets,
        recentAuditLogs,
        userActivity,
      ] = await Promise.all([
        // Clinic info
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

        // Total patients
        prisma.patient.count({ where: { clinicId } }),

        // Active patients (has recent order in last 30 days)
        prisma.patient.count({
          where: {
            clinicId,
            orders: { some: { createdAt: { gte: thirtyDaysAgo } } },
          },
        }),

        // New patients this month
        prisma.patient.count({
          where: {
            clinicId,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),

        // Total users
        prisma.user.count({
          where: {
            OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
          },
        }),

        // Active users (logged in last 7 days)
        prisma.user.count({
          where: {
            OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
            lastLogin: { gte: sevenDaysAgo },
          },
        }),

        // Total providers
        prisma.user.count({
          where: {
            OR: [
              { clinicId, role: 'PROVIDER' },
              { userClinics: { some: { clinicId, isActive: true, role: 'PROVIDER' } } },
            ],
          },
        }),

        // Total orders
        prisma.order.count({ where: { clinicId } }),

        // Orders this month
        prisma.order.count({
          where: {
            clinicId,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),

        // Pending orders
        prisma.order.count({
          where: {
            clinicId,
            status: { in: ['pending', 'processing', 'awaiting_prescription'] },
          },
        }),

        // Completed orders
        prisma.order.count({
          where: {
            clinicId,
            status: 'completed',
          },
        }),

        // Total tickets
        prisma.ticket.count({ where: { clinicId } }),

        // Open tickets
        prisma.ticket.count({
          where: {
            clinicId,
            status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
          },
        }),

        // Recent audit logs count
        prisma.clinicAuditLog.count({
          where: {
            clinicId,
            createdAt: { gte: sevenDaysAgo },
          },
        }),

        // User activity summary
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
    } catch (error) {
      logger.error('Error fetching clinic stats:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
        userId: user.id,
        clinicId: user.clinicId,
      });
      return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
