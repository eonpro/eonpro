/**
 * Invoices API
 * 
 * GET /api/invoices - List invoices (for admin dashboard)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can view all invoices
  if (!['admin', 'super_admin', 'provider', 'staff'].includes(auth.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status'); // DRAFT, OPEN, PAID, VOID, etc.
    const patientId = searchParams.get('patientId');

    // Build where clause
    const where: any = {};
    
    // Multi-tenant: filter by clinic unless super_admin
    if (auth.user.clinicId && auth.user.role !== 'super_admin') {
      where.clinicId = auth.user.clinicId;
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (patientId) {
      where.patientId = parseInt(patientId, 10);
    }

    // Fetch invoices with patient info
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100), // Cap at 100
        skip: offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    // Transform for frontend
    const formattedInvoices = invoices.map((inv: typeof invoices[number]) => ({
      id: inv.id,
      stripeInvoiceId: inv.stripeInvoiceId,
      stripeInvoiceUrl: inv.stripeInvoiceUrl,
      patient: inv.patient,
      description: inv.description,
      amount: inv.amount,
      amountDue: inv.amountDue,
      amountPaid: inv.amountPaid,
      total: inv.amount, // Alias for compatibility
      currency: inv.currency,
      status: inv.status,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      lineItems: inv.lineItems,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('[Invoices API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
