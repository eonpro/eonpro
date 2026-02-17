/**
 * Invoices API
 *
 * GET /api/invoices - List invoices (for admin dashboard)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  requirePermission(toPermissionContext(auth.user), 'invoice:view');

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status'); // DRAFT, OPEN, PAID, VOID, etc.
    const patientId = searchParams.get('patientId');
    const search = searchParams.get('search');

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

    // Server-side search: patient name (via searchIndex), description, or invoice number
    if (search && search.trim().length > 0) {
      const term = search.trim().toLowerCase();
      where.OR = [
        { patient: { searchIndex: { contains: term, mode: 'insensitive' } } },
        { description: { contains: term, mode: 'insensitive' } },
        { stripeInvoiceId: { contains: term, mode: 'insensitive' } },
        { invoiceNumber: { contains: term, mode: 'insensitive' } },
      ];
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
              profileStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100), // Cap at 100
        skip: offset,
      }),
      prisma.invoice.count({ where }),
    ]);

    await auditPhiAccess(req, buildAuditPhiOptions(req, auth.user, 'invoice:view', {
      route: 'GET /api/invoices',
      patientId: patientId ? parseInt(patientId, 10) : undefined,
    }));

    // Transform for frontend (decrypt patient PHI before sending)
    const formattedInvoices = invoices.map((inv: (typeof invoices)[number]) => {
      let patient = inv.patient;
      if (patient) {
        try {
          patient = decryptPatientPHI(patient as Record<string, unknown>, [
            'firstName',
            'lastName',
            'email',
          ]) as typeof patient;
        } catch (decryptErr) {
          logger.warn('[Invoices API] Failed to decrypt patient PHI', {
            patientId: patient.id,
            error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
          });
        }
      }
      return {
        id: inv.id,
        stripeInvoiceId: inv.stripeInvoiceId,
        stripeInvoiceUrl: inv.stripeInvoiceUrl,
        patient,
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
        metadata: inv.metadata, // Include metadata for refund info and source
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      invoices: formattedInvoices,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('[Invoices API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
