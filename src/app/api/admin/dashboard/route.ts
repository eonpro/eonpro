/**
 * ADMIN DASHBOARD API
 * ====================
 * Returns real-time statistics for the admin dashboard
 * 
 * GET /api/admin/dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(req);
    
    // Allow development mode fallback
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    let clinicId: number | undefined | null = undefined;
    let role: string = 'admin';
    
    if (authResult.success && authResult.user) {
      clinicId = authResult.user.clinicId;
      role = authResult.user.role || 'admin';
    } else if (isDevelopment) {
      // Development fallback
      logger.warn('[Dashboard API] Using development fallback');
      clinicId = undefined; // Show all data in dev
      role = 'super_admin';
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    // Build clinic filter - handle both undefined and null clinicId
    const isSuperAdmin = role.toLowerCase() === 'super_admin';
    const clinicFilter = isSuperAdmin || !clinicId ? {} : { clinicId };

    // Get total patients (current month)
    const totalPatients = await prisma.patient.count({
      where: clinicFilter,
    });

    // Get patients from last month for comparison
    const lastMonthPatients = await prisma.patient.count({
      where: {
        ...clinicFilter,
        createdAt: {
          lt: startOfMonth,
        },
      },
    });

    // Calculate patient change percentage
    const patientsChange = lastMonthPatients > 0 
      ? (((totalPatients - lastMonthPatients) / lastMonthPatients) * 100).toFixed(1)
      : totalPatients > 0 ? 100 : 0;

    // Get active providers
    const activeProviders = await prisma.provider.count({
      where: {
        ...clinicFilter,
        status: { in: ['ACTIVE', 'active', undefined] },
      },
    });

    // Get provider count from last month
    const lastMonthProviders = await prisma.provider.count({
      where: {
        ...clinicFilter,
        createdAt: {
          lt: startOfMonth,
        },
      },
    });

    const providersChange = lastMonthProviders > 0
      ? (((activeProviders - lastMonthProviders) / lastMonthProviders) * 100).toFixed(1)
      : activeProviders > 0 ? 100 : 0;

    // Get pending orders (this week)
    const pendingOrders = await prisma.order.count({
      where: {
        ...clinicFilter,
        status: { in: ['PENDING', 'pending', 'PROCESSING', 'processing'] },
      },
    });

    // Get orders from last week
    const lastWeekOrders = await prisma.order.count({
      where: {
        ...clinicFilter,
        status: { in: ['PENDING', 'pending', 'PROCESSING', 'processing'] },
        createdAt: {
          gte: startOfLastWeek,
          lt: startOfWeek,
        },
      },
    });

    const ordersChange = lastWeekOrders > 0
      ? (((pendingOrders - lastWeekOrders) / lastWeekOrders) * 100).toFixed(1)
      : pendingOrders > 0 ? 100 : 0;

    // Get monthly revenue from invoices
    const monthlyInvoices = await prisma.invoice.aggregate({
      where: {
        ...clinicFilter,
        status: { in: ['PAID', 'paid'] },
        paidAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amountPaid: true,
      },
    });

    const lastMonthInvoices = await prisma.invoice.aggregate({
      where: {
        ...clinicFilter,
        status: { in: ['PAID', 'paid'] },
        paidAt: {
          gte: startOfLastMonth,
          lt: startOfMonth,
        },
      },
      _sum: {
        amountPaid: true,
      },
    });

    const totalRevenue = (monthlyInvoices._sum.amountPaid || 0) / 100; // Convert from cents
    const lastMonthRevenue = (lastMonthInvoices._sum.amountPaid || 0) / 100;

    const revenueChange = lastMonthRevenue > 0
      ? (((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      : totalRevenue > 0 ? 100 : 0;

    // Get recent activity from audit logs
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: clinicFilter,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    // Transform audit logs to activity items
    const recentActivities = recentAuditLogs.map((log: any) => {
      const userName = log.user 
        ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
        : 'System';
      
      let type: 'patient' | 'order' | 'payment' | 'staff' = 'staff';
      let message = log.action;

      if (log.action.includes('PATIENT') || log.action.includes('patient')) {
        type = 'patient';
        message = log.action.replace(/_/g, ' ').toLowerCase();
      } else if (log.action.includes('ORDER') || log.action.includes('order')) {
        type = 'order';
        message = log.action.replace(/_/g, ' ').toLowerCase();
      } else if (log.action.includes('PAYMENT') || log.action.includes('payment') || log.action.includes('INVOICE')) {
        type = 'payment';
        message = log.action.replace(/_/g, ' ').toLowerCase();
      }

      // Calculate relative time
      const diff = now.getTime() - new Date(log.createdAt).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      let time = '';
      if (days > 0) time = `${days} day${days > 1 ? 's' : ''} ago`;
      else if (hours > 0) time = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      else if (minutes > 0) time = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      else time = 'Just now';

      return {
        id: log.id.toString(),
        type,
        message: message.charAt(0).toUpperCase() + message.slice(1),
        time,
        user: userName,
      };
    });

    // Get monthly revenue data for chart (last 6 months)
    const monthlyRevenueData: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthRevenue = await prisma.invoice.aggregate({
        where: {
          ...clinicFilter,
          status: { in: ['PAID', 'paid'] },
          paidAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amountPaid: true,
        },
      });

      monthlyRevenueData.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        revenue: (monthRevenue._sum.amountPaid || 0) / 100,
      });
    }

    // Get daily patient activity for the week
    const dailyPatientData: { day: string; newPatients: number; returningPatients: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const newPatients = await prisma.patient.count({
        where: {
          ...clinicFilter,
          createdAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      const dayName = dayStart.toLocaleString('default', { weekday: 'short' });
      dailyPatientData.push({
        day: dayName,
        newPatients,
        returningPatients: 0, // We don't track returning patients separately yet
      });
    }

    return NextResponse.json({
      stats: {
        totalPatients,
        patientsChange: parseFloat(patientsChange as string),
        totalRevenue,
        revenueChange: parseFloat(revenueChange as string),
        activeProviders,
        providersChange: parseFloat(providersChange as string),
        pendingOrders,
        ordersChange: parseFloat(ordersChange as string),
      },
      recentActivities: recentActivities.length > 0 ? recentActivities : [],
      charts: {
        monthlyRevenue: monthlyRevenueData,
        dailyPatients: dailyPatientData,
      },
    });

  } catch (error: any) {
    logger.error('Error fetching dashboard stats', { 
      error: error.message, 
      stack: error.stack,
      name: error.name 
    });
    
    // Return partial data with error indicator
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard data',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        stats: {
          totalPatients: 0,
          patientsChange: 0,
          totalRevenue: 0,
          revenueChange: 0,
          activeProviders: 0,
          providersChange: 0,
          pendingOrders: 0,
          ordersChange: 0,
        },
        recentActivities: [],
        charts: {
          monthlyRevenue: [],
          dailyPatients: [],
        },
      },
      { status: 500 }
    );
  }
}
