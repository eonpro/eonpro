/**
 * Admin Dashboard Stats API
 * =========================
 * 
 * Provides comprehensive dashboard statistics including:
 * - Total intakes (patients without payment/order)
 * - Total converted patients (with payment/order)
 * - Total prescriptions/orders
 * - Conversion rate
 * - Revenue from paid invoices
 * 
 * @module api/admin/dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface DashboardStats {
  // Counts
  totalIntakes: number;
  totalPatients: number;
  totalPrescriptions: number;
  
  // Conversion
  conversionRate: number;
  
  // Revenue
  totalRevenue: number;
  recurringRevenue: number;
  
  // Recent activity (24h)
  recentIntakes: number;
  recentPrescriptions: number;
  recentRevenue: number;
}

/**
 * GET /api/admin/dashboard
 * Get comprehensive dashboard statistics
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;
    const clinicFilter = clinicId ? { clinicId } : {};

    // Calculate 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all patient IDs that have successful payments or orders (converted patients)
    const [patientsWithPayments, patientsWithOrders] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: 'SUCCEEDED',
          ...(clinicId && { patient: { clinicId } })
        },
        select: { patientId: true },
        distinct: ['patientId']
      }),
      prisma.order.findMany({
        where: {
          ...(clinicId && { patient: { clinicId } })
        },
        select: { patientId: true },
        distinct: ['patientId']
      })
    ]);

    // Combine to get all converted patient IDs
    const convertedIds = new Set<number>();
    for (const p of patientsWithPayments) {
      convertedIds.add(p.patientId);
    }
    for (const o of patientsWithOrders) {
      convertedIds.add(o.patientId);
    }

    // Get counts
    const [
      totalPatientsCount,
      totalOrdersCount,
      recentPatientsCount,
      recentOrdersCount,
      paidInvoices,
      recentPaidInvoices,
      activeSubscriptions
    ] = await Promise.all([
      // Total patients (all in database)
      prisma.patient.count({ where: clinicFilter }),
      
      // Total orders/prescriptions
      prisma.order.count({ where: clinicFilter }),
      
      // Recent patients (24h)
      prisma.patient.count({
        where: {
          ...clinicFilter,
          createdAt: { gte: twentyFourHoursAgo }
        }
      }),
      
      // Recent orders (24h)
      prisma.order.count({
        where: {
          ...clinicFilter,
          createdAt: { gte: twentyFourHoursAgo }
        }
      }),
      
      // Total revenue from paid invoices (get both amountPaid and amount)
      prisma.invoice.findMany({
        where: {
          ...clinicFilter,
          status: 'PAID'
        },
        select: { amountPaid: true, amount: true }
      }),
      
      // Recent revenue (24h)
      prisma.invoice.findMany({
        where: {
          ...clinicFilter,
          status: 'PAID',
          paidAt: { gte: twentyFourHoursAgo }
        },
        select: { amountPaid: true, amount: true }
      }),
      
      // Recurring revenue from active subscriptions
      prisma.subscription.findMany({
        where: {
          ...clinicFilter,
          status: 'ACTIVE'
        },
        select: {
          amount: true,
          interval: true
        }
      })
    ]);

    // Calculate stats
    const totalConverted = convertedIds.size;
    const totalIntakes = totalPatientsCount - totalConverted;
    
    // Conversion rate: converted / total * 100
    const conversionRate = totalPatientsCount > 0 
      ? Math.round((totalConverted / totalPatientsCount) * 100 * 10) / 10 
      : 0;
    
    // Revenue in cents - use amountPaid if set, otherwise fall back to amount
    const sumInvoices = (invoices: Array<{ amountPaid: number; amount: number | null }>) => {
      return invoices.reduce((sum, inv) => {
        // Use amountPaid if > 0, otherwise use amount
        const invoiceAmount = inv.amountPaid > 0 ? inv.amountPaid : (inv.amount || 0);
        return sum + invoiceAmount;
      }, 0);
    };
    
    const totalRevenue = sumInvoices(paidInvoices) / 100;
    const recentRevenue = sumInvoices(recentPaidInvoices) / 100;
    
    // Calculate monthly recurring revenue (MRR)
    let recurringRevenue = 0;
    for (const sub of activeSubscriptions) {
      const amount = sub.amount || 0;
      // Normalize to monthly
      switch (sub.interval) {
        case 'year':
        case 'yearly':
        case 'annual':
          recurringRevenue += amount / 12;
          break;
        case 'quarter':
        case 'quarterly':
          recurringRevenue += amount / 3;
          break;
        case 'week':
        case 'weekly':
          recurringRevenue += amount * 4;
          break;
        default: // monthly
          recurringRevenue += amount;
      }
    }
    recurringRevenue = recurringRevenue / 100; // Convert cents to dollars

    const stats: DashboardStats = {
      totalIntakes,
      totalPatients: totalConverted,
      totalPrescriptions: totalOrdersCount,
      conversionRate,
      totalRevenue,
      recurringRevenue,
      recentIntakes: recentPatientsCount,
      recentPrescriptions: recentOrdersCount,
      recentRevenue
    };

    logger.info('[ADMIN-DASHBOARD] Stats fetched', {
      userId: user.id,
      clinicId,
      stats: {
        totalIntakes: stats.totalIntakes,
        totalPatients: stats.totalPatients,
        totalPrescriptions: stats.totalPrescriptions,
        conversionRate: stats.conversionRate,
        totalRevenue: stats.totalRevenue
      }
    });

    return NextResponse.json({ stats });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-DASHBOARD] Error fetching stats', {
      error: errorMessage,
      userId: user.id
    });
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
