import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication - billing data is sensitive
    const auth = await verifyAuth(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['super_admin', 'admin'];
    if (!allowedRoles.includes(auth.user.role)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get current month start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Build clinic filter for non-super-admin users
    const clinicFilter = auth.user.role !== 'super_admin' && auth.user.clinicId
      ? { clinicId: auth.user.clinicId }
      : {};

    // Fetch total revenue (all successful payments)
    const totalRevenueData = await prisma.payment.aggregate({
      where: {
        status: PaymentStatus.SUCCEEDED,
        ...clinicFilter,
      },
      _sum: {
        amount: true,
      },
    });
    const totalRevenue = (totalRevenueData._sum.amount || 0) / 100; // Convert cents to dollars

    // Fetch monthly revenue (current month)
    const monthlyRevenueData = await prisma.payment.aggregate({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: {
          gte: monthStart,
        },
        ...clinicFilter,
      },
      _sum: {
        amount: true,
      },
    });
    const monthlyRevenue = (monthlyRevenueData._sum.amount || 0) / 100;

    // Count active subscriptions
    const activeSubscriptions = await prisma.subscription.count({
      where: {
        status: SubscriptionStatus.ACTIVE,
        ...clinicFilter,
      },
    });

    // Count total patients
    const totalPatients = await prisma.patient.count({
      where: clinicFilter,
    });

    // Fetch recent payments with patient info
    const recentPayments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        ...clinicFilter,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      include: {
        invoice: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Format recent payments
    const formattedPayments = recentPayments.map((payment: any) => ({
      id: payment.id,
      patientName: payment.invoice?.patient
        ? `${payment.invoice.patient.firstName} ${payment.invoice.patient.lastName}`
        : "Unknown Patient",
      patientId: payment.invoice?.patient?.id || 0,
      amount: payment.amount / 100,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      paymentMethod: payment.paymentMethod || undefined,
      description: payment.description || undefined,
    }));

    // Fetch pending invoices
    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        status: "DRAFT", // Assuming DRAFT means pending payment
        ...clinicFilter,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Format pending invoices
    const formattedInvoices = pendingInvoices.map((invoice: any) => ({
      id: invoice.id,
      patientName: invoice.patient
        ? `${invoice.patient.firstName} ${invoice.patient.lastName}`
        : "Unknown Patient",
      patientId: invoice.patient?.id || 0,
      amount: invoice.amountDue / 100,
      dueDate: invoice.dueDate?.toISOString() || undefined,
      stripeInvoiceNumber: invoice.stripeInvoiceNumber || undefined,
    }));

    return NextResponse.json({
      totalRevenue,
      monthlyRevenue,
      activeSubscriptions,
      totalPatients,
      recentPayments: formattedPayments,
      pendingInvoices: formattedInvoices,
    });
  } catch (error: any) {
    logger.error("[Admin Billing Stats API] Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing statistics" },
      { status: 500 }
    );
  }
}
