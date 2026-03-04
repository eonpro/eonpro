import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { Prisma } from '@prisma/client';

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

async function handleGetShipping(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || '';
    const carrier = searchParams.get('carrier') || '';
    const source = searchParams.get('source') || '';

    const clinicFilter: Prisma.PatientShippingUpdateWhereInput =
      user.role === 'super_admin' ? {} : { clinicId: user.clinicId };

    const where: Prisma.PatientShippingUpdateWhereInput = {
      ...clinicFilter,
      ...(status && status !== 'all' ? { status: status as any } : {}),
      ...(carrier && carrier !== 'all'
        ? { carrier: { contains: carrier, mode: 'insensitive' as const } }
        : {}),
      ...(source && source !== 'all' ? { source } : {}),
      ...(search
        ? {
            OR: [
              { trackingNumber: { contains: search, mode: 'insensitive' as const } },
              { medicationName: { contains: search, mode: 'insensitive' as const } },
              { carrier: { contains: search, mode: 'insensitive' as const } },
              { lifefileOrderId: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.patientShippingUpdate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
          order: {
            select: { id: true, lifefileOrderId: true, primaryMedName: true, primaryMedStrength: true },
          },
        },
      }),
      prisma.patientShippingUpdate.count({ where }),
    ]);

    const trackingNumbers = records.map((r) => r.trackingNumber);
    const patientIds = records.map((r) => r.patientId).filter((id): id is number => id !== null);

    const labels = trackingNumbers.length > 0
      ? await prisma.shipmentLabel.findMany({
          where: {
            trackingNumber: { in: trackingNumbers },
            ...(patientIds.length > 0 ? { patientId: { in: patientIds } } : {}),
          },
          select: {
            id: true,
            trackingNumber: true,
            patientId: true,
            status: true,
            labelFormat: true,
            labelS3Key: true,
            labelPdfBase64: true,
          },
        })
      : [];

    const labelMap = new Map(
      labels.map((l) => [`${l.trackingNumber}-${l.patientId}`, l]),
    );

    const formatted = records.map((r) => {
      const label = labelMap.get(`${r.trackingNumber}-${r.patientId}`);
      return {
        id: r.id,
        trackingNumber: r.trackingNumber,
        carrier: r.carrier,
        trackingUrl: r.trackingUrl,
        status: r.status,
        statusNote: r.statusNote,
        patientId: r.patientId,
        patientName: r.patient
          ? `${safeDecrypt(r.patient.firstName)} ${safeDecrypt(r.patient.lastName)}`.trim()
          : null,
        medicationName: r.medicationName || r.order?.primaryMedName || null,
        medicationStrength: r.medicationStrength || r.order?.primaryMedStrength || null,
        shippedAt: r.shippedAt,
        estimatedDelivery: r.estimatedDelivery,
        actualDelivery: r.actualDelivery,
        source: r.source,
        orderId: r.orderId || r.order?.id || null,
        lifefileOrderId: r.lifefileOrderId || r.order?.lifefileOrderId || null,
        labelId: label?.id ?? null,
        labelStatus: label?.status ?? null,
        hasLabel: !!(label?.labelPdfBase64 || label?.labelS3Key),
        labelFormat: label?.labelFormat ?? null,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({
      records: formatted,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/shipping' });
  }
}

export const GET = withAuth(handleGetShipping, {
  roles: ['super_admin', 'admin', 'staff'],
});
