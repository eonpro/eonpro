/**
 * Revenue Transactions Drill-Down API
 *
 * GET /api/finance/revenue/transactions
 * Returns payment transactions for drill-down / export
 *
 * Query params: startDate, endDate, limit, offset, format=csv (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const format = searchParams.get('format') || 'json';

    if (!startParam || !endParam) {
      return NextResponse.json(
        { error: 'startDate and endDate required' },
        { status: 400 }
      );
    }

    const startDate = new Date(startParam);
    const endDate = new Date(endParam);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/db');

    const payments = await prisma.payment.findMany({
      where: {
        clinicId,
        status: 'SUCCEEDED',
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        invoice: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.payment.count({
      where: {
        clinicId,
        status: 'SUCCEEDED',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const transactions = payments.map((p) => {
      let patient = p.patient;
      if (patient) {
        try {
          patient = decryptPatientPHI(patient as Record<string, unknown>, [
            'firstName',
            'lastName',
            'email',
          ]) as typeof patient;
        } catch {
          // keep as-is if decryption fails
        }
      }
      return {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paymentMethod: p.paymentMethod || 'unknown',
        createdAt: p.createdAt,
        patientId: p.patientId,
        patientName: patient
          ? `${(patient as { firstName?: string }).firstName ?? ''} ${(patient as { lastName?: string }).lastName ?? ''}`.trim()
          : null,
        invoiceId: p.invoiceId,
      };
    });

    if (format === 'csv') {
      const header = 'Date,Patient,Amount (cents),Amount (USD),Payment Method,Invoice ID';
      const rows = transactions.map(
        (t) =>
          `${new Date(t.createdAt).toISOString().slice(0, 10)},"${(t.patientName || '').replace(/"/g, '""')}",${t.amount},${(t.amount / 100).toFixed(2)},${t.paymentMethod},${t.invoiceId ?? ''}`
      );
      const csv = [header, ...rows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="revenue-transactions-${startParam}-${endParam}.csv"`,
        },
      });
    }

    return NextResponse.json({
      transactions,
      total,
      limit,
      offset,
      dateRange: { start: startParam, end: endParam },
    });
  } catch (error) {
    logger.error('[Revenue Transactions] Error', { error });
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
