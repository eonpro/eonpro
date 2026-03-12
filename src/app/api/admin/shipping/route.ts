const _ROUTE_BUILD = '2026-03-12T19:30:00Z';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import {
  buildIncompleteSearchIndexWhere,
  buildPatientSearchIndex,
  buildPatientSearchWhere,
  splitSearchTerms,
} from '@/lib/utils/search';
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

    const patientSearchWhere = search
      ? (buildPatientSearchWhere(search) as Prisma.PatientWhereInput)
      : null;

    const matchedPatientIds = new Set<number>();
    if (search) {
      const patientClinicFilter: Prisma.PatientWhereInput =
        user.role === 'super_admin' ? {} : { clinicId: user.clinicId };

      // Fast path: indexed patient search.
      const indexedPatientMatches = await prisma.patient.findMany({
        where: {
          ...patientClinicFilter,
          ...(patientSearchWhere ?? {}),
        },
        select: { id: true },
        take: 500,
      });
      for (const p of indexedPatientMatches) {
        matchedPatientIds.add(p.id);
      }

      // Fallback path: scan incomplete searchIndex patients and self-heal matches.
      if (matchedPatientIds.size === 0) {
        const fallbackCandidates = await prisma.patient.findMany({
          where: {
            ...patientClinicFilter,
            ...(buildIncompleteSearchIndexWhere() as Prisma.PatientWhereInput),
          },
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            searchIndex: true,
          },
          orderBy: { id: 'desc' },
          take: 500,
        });

        const terms = splitSearchTerms(search);
        const searchLower = search.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');
        const selfHealUpdates: Array<{ id: number; searchIndex: string }> = [];

        for (const patient of fallbackCandidates) {
          const fn = safeDecrypt(patient.firstName).toLowerCase();
          const ln = safeDecrypt(patient.lastName).toLowerCase();
          const em = safeDecrypt(patient.email).toLowerCase();
          const ph = safeDecrypt(patient.phone).replace(/\D/g, '');
          const pid = (patient.patientId || '').toLowerCase();

          let matchesSearch = false;
          if (terms.length <= 1) {
            const t = terms[0] || searchLower;
            matchesSearch =
              fn.includes(t) ||
              ln.includes(t) ||
              em.includes(t) ||
              pid.includes(t) ||
              (searchDigits.length >= 3 && ph.includes(searchDigits));
          } else {
            const fullName = `${fn} ${ln}`;
            matchesSearch =
              fullName.includes(searchLower) ||
              terms.every((t) => fn.includes(t) || ln.includes(t) || em.includes(t) || pid.includes(t));
          }

          if (matchesSearch) {
            matchedPatientIds.add(patient.id);
            const rebuiltIndex = buildPatientSearchIndex({
              firstName: fn || null,
              lastName: ln || null,
              email: em || null,
              phone: ph || null,
              patientId: pid || null,
            });
            if (rebuiltIndex && rebuiltIndex !== patient.searchIndex) {
              selfHealUpdates.push({ id: patient.id, searchIndex: rebuiltIndex });
            }
          }
        }

        if (selfHealUpdates.length > 0) {
          Promise.all(
            selfHealUpdates.map(({ id, searchIndex }) =>
              prisma.patient.update({
                where: { id },
                data: { searchIndex },
              }).catch((err) => {
                logger.warn('[ADMIN-SHIPPING] Self-heal searchIndex failed', {
                  patientId: id,
                  error: err instanceof Error ? err.message : String(err),
                });
                return null;
              })
            )
          ).catch((err) => {
            logger.warn('[ADMIN-SHIPPING] Self-heal batch failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }

    const searchConditions: Prisma.PatientShippingUpdateWhereInput[] = search
      ? [
          { trackingNumber: { contains: search, mode: 'insensitive' as const } },
          { medicationName: { contains: search, mode: 'insensitive' as const } },
          { carrier: { contains: search, mode: 'insensitive' as const } },
          { lifefileOrderId: { contains: search, mode: 'insensitive' as const } },
          ...(matchedPatientIds.size > 0
            ? [{ patientId: { in: Array.from(matchedPatientIds) } }]
            : []),
          ...(patientSearchWhere ? [{ patient: { is: patientSearchWhere } }] : []),
        ]
      : [];

    const where: Prisma.PatientShippingUpdateWhereInput = {
      ...clinicFilter,
      ...(status && status !== 'all' ? { status: status as any } : {}),
      ...(carrier && carrier !== 'all'
        ? { carrier: { contains: carrier, mode: 'insensitive' as const } }
        : {}),
      ...(source && source !== 'all' ? { source } : {}),
      ...(searchConditions.length > 0 ? { OR: searchConditions } : {}),
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
  roles: ['super_admin', 'admin', 'staff', 'pharmacy_rep'],
});
