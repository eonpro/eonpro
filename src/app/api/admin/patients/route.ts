/**
 * Admin Patients API Route
 * ========================
 *
 * Lists patients who HAVE been converted from intakes.
 * A patient is converted when they have a successful payment or prescription/order.
 *
 * For sales_rep role, only shows patients assigned to them.
 *
 * Search uses the `searchIndex` column (populated on create/update) with a
 * pg_trgm GIN index for O(1) substring matching at any scale (10M+ records).
 *
 * Performance: Uses Prisma `some` relation filters to generate efficient
 * EXISTS subqueries instead of fetching IDs separately.
 *
 * @module api/admin/patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { parseTakeFromParams } from '@/lib/pagination';
import { splitSearchTerms } from '@/lib/utils/search';
import { Prisma, PrismaClient } from '@prisma/client';

// Roles that can access this endpoint
const ALLOWED_ROLES = ['super_admin', 'admin', 'sales_rep'] as const;

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    const parts = value.split(':');
    // Min length of 2 to handle short encrypted values like state codes
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value);
    }
    return value; // Not encrypted, return as-is
  } catch {
    // Decryption failed - return null instead of encrypted blob
    return null;
  }
};

/**
 * GET /api/admin/patients
 * List patients who are converted (have payment or order)
 * For sales_rep role, only shows patients assigned to them
 *
 * Uses Prisma `some` relation filters for converted-patient detection,
 * which generates efficient EXISTS subqueries (indexed, stops at first match).
 * This replaces the prior 3-phase "fetch all IDs → IN clause" pattern that
 * generated 100+ queries and caused 500s on serverless (connection_limit=1).
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseTakeFromParams(searchParams);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const search = (searchParams.get('search') || '').trim();
    const includeContact = searchParams.get('includeContact') === 'true';
    const salesRepId = searchParams.get('salesRepId');

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Super admin has no clinic context set by middleware, so the clinic-filtered
    // `prisma` wrapper throws TenantContextRequiredError for clinic-isolated models.
    // Use basePrisma for super_admin (patient is in BASE_PRISMA_ALLOWLIST; nested
    // includes are resolved internally by Prisma, bypassing the guarded proxy).
    const db = (user.role === 'super_admin' ? basePrisma : prisma) as PrismaClient;

    // Build WHERE using Prisma `some` relation filters → EXISTS subqueries.
    // All top-level keys are ANDed together by Prisma.
    const whereClause: Prisma.PatientWhereInput = {
      OR: [
        { payments: { some: { status: 'SUCCEEDED' } } },
        { orders: { some: {} } },
      ],
    };

    // Clinic filter (explicit for basePrisma; redundant but harmless for wrapped prisma)
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // Sales rep: use relation filter instead of separate ID-fetch query
    if (user.role === 'sales_rep') {
      whereClause.salesRepAssignments = {
        some: {
          salesRepId: user.id,
          isActive: true,
          ...(clinicId ? { clinicId } : {}),
        },
      };
    } else if (salesRepId && (user.role === 'admin' || user.role === 'super_admin')) {
      whereClause.salesRepAssignments = {
        some: {
          salesRepId: parseInt(salesRepId, 10),
          isActive: true,
          ...(clinicId ? { clinicId } : {}),
        },
      };
    }

    // Save base WHERE before adding search filter (used for fallback query)
    const baseWhere: Prisma.PatientWhereInput = { ...whereClause };

    // Search filter using the searchIndex column (DB-level, scales to 10M+)
    // Also searches patientId directly (not encrypted) for single-term queries.
    // Patients with NULL searchIndex are handled via a fallback query below.
    if (search) {
      const terms = splitSearchTerms(search);
      const searchDigitsOnly = search.replace(/\D/g, '');
      const isPhoneSearch = searchDigitsOnly.length >= 3 && searchDigitsOnly === search.trim();

      if (isPhoneSearch) {
        whereClause.searchIndex = { contains: searchDigitsOnly, mode: 'insensitive' };
      } else if (terms.length === 1) {
        // Search both searchIndex AND patientId for wider coverage
        whereClause.AND = [
          {
            OR: [
              { searchIndex: { contains: terms[0], mode: 'insensitive' as const } },
              { patientId: { contains: terms[0], mode: 'insensitive' as const } },
            ],
          },
        ];
      } else {
        // Multi-term: ALL terms must appear in searchIndex
        whereClause.AND = terms.map((term) => ({
          searchIndex: { contains: term, mode: 'insensitive' as const },
        }));
      }
    }

    // Use explicit `select` (not `include`) to avoid SELECT * on Patient.
    // This prevents failures when schema columns haven't been migrated yet
    // (e.g. portalNotificationPrefs) and reduces data transfer.
    const patientSelect = {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      gender: true,
      tags: true,
      source: true,
      createdAt: true,
      clinicId: true,
      email: true,
      phone: true,
      dob: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      zip: true,
      searchIndex: true,
      clinic: {
        select: { id: true, name: true, subdomain: true },
      },
      payments: {
        where: { status: 'SUCCEEDED' as const },
        orderBy: { paidAt: 'desc' as const },
        take: 3,
        select: {
          paidAt: true,
          amount: true,
          invoiceId: true,
          invoice: {
            select: {
              items: {
                select: {
                  description: true,
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      orders: {
        orderBy: { createdAt: 'desc' as const },
        take: 3,
        select: {
          createdAt: true,
          status: true,
          primaryMedName: true,
          primaryMedStrength: true,
          primaryMedForm: true,
          rxs: {
            select: { medName: true, strength: true, form: true },
          },
        },
      },
      salesRepAssignments: {
        where: { isActive: true },
        take: 1,
        select: {
          id: true,
          salesRepId: true,
          assignedAt: true,
          salesRep: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    } as const;

    // Phase 1: Main query using searchIndex (fast path for indexed patients)
    const [indexedPatients, indexedTotal] = await Promise.all([
      db.patient.findMany({
        where: whereClause,
        select: patientSelect,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.patient.count({ where: whereClause }),
    ]);

    // Phase 2: Fallback for patients with NULL/empty searchIndex
    // These patients were created before searchIndex was added, or through
    // code paths that didn't populate it. We decrypt PHI and filter in-memory.
    let fallbackPatients: typeof indexedPatients = [];
    if (search) {
      const fallbackWhere: Prisma.PatientWhereInput = {
        ...baseWhere,
        AND: [{ OR: [{ searchIndex: null }, { searchIndex: '' }] }],
      };

      const unindexedCount = await db.patient.count({ where: fallbackWhere });

      if (unindexedCount > 0) {
        const MAX_FALLBACK = 2000;
        if (unindexedCount > MAX_FALLBACK) {
          logger.warn('[ADMIN-PATIENTS] Large number of unindexed patients — run backfill', {
            count: unindexedCount,
            max: MAX_FALLBACK,
            recommendation: 'POST /api/admin/backfill-search-index',
          });
        }

        const unindexed = await db.patient.findMany({
          where: fallbackWhere,
          select: patientSelect,
          orderBy: { createdAt: 'desc' },
          take: Math.min(unindexedCount, MAX_FALLBACK),
        });

        // Decrypt PHI and filter in-memory
        const terms = splitSearchTerms(search);
        const searchLower = search.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');

        fallbackPatients = unindexed.filter((p) => {
          const fn = safeDecrypt(p.firstName)?.toLowerCase() || '';
          const ln = safeDecrypt(p.lastName)?.toLowerCase() || '';
          const em = safeDecrypt(p.email)?.toLowerCase() || '';
          const ph = (safeDecrypt(p.phone) || '').replace(/\D/g, '');
          const pid = (p.patientId || '').toLowerCase();

          if (terms.length === 1) {
            const t = terms[0];
            return (
              fn.includes(t) ||
              ln.includes(t) ||
              em.includes(t) ||
              pid.includes(t) ||
              (searchDigits.length >= 3 && ph.includes(searchDigits))
            );
          }

          // Multi-term: try full name match or all-terms match
          const fullName = `${fn} ${ln}`;
          if (fullName.includes(searchLower)) return true;
          return terms.every(
            (t) => fn.includes(t) || ln.includes(t) || pid.includes(t) || em.includes(t)
          );
        });

        logger.info('[ADMIN-PATIENTS] Fallback search completed', {
          unindexedCount,
          matchesFound: fallbackPatients.length,
          searchQuery: search,
        });
      }
    }

    // Combine indexed + fallback results, deduplicating by patient ID
    const seenIds = new Set(indexedPatients.map((p) => p.id));
    const uniqueFallback = fallbackPatients.filter((p) => !seenIds.has(p.id));
    const patients = [...indexedPatients, ...uniqueFallback];
    const total = indexedTotal + uniqueFallback.length;

    // Transform response
    const patientsData = patients.map((patient) => {
      const lastPayment = patient.payments?.[0];
      const lastOrder = patient.orders?.[0];
      const salesRepAssignment = patient.salesRepAssignments?.[0];

      // Build medication names from orders (Rx medName or Order.primaryMedName)
      // and from paid invoices (Product.name or InvoiceItem.description)
      const medicationNames = new Set<string>();
      for (const order of patient.orders || []) {
        if (order.rxs && order.rxs.length > 0) {
          for (const rx of order.rxs) {
            if (rx.medName?.trim()) {
              const display = rx.strength?.trim()
                ? `${rx.medName.trim()} (${rx.strength})`
                : rx.medName.trim();
              medicationNames.add(display);
            }
          }
        } else if (order.primaryMedName?.trim()) {
          const display = order.primaryMedStrength?.trim()
            ? `${order.primaryMedName.trim()} (${order.primaryMedStrength})`
            : order.primaryMedName.trim();
          medicationNames.add(display);
        }
      }
      // Add product names from paid invoices (for payment-only or supplement)
      for (const payment of patient.payments || []) {
        const inv = payment.invoice;
        if (!inv?.items) continue;
        for (const item of inv.items) {
          const name = item.product?.name?.trim() || item.description?.trim();
          if (name && name.length > 2) medicationNames.add(name);
        }
      }

      // Determine conversion date
      const paymentDate = lastPayment?.paidAt;
      const orderDate = lastOrder?.createdAt;
      let convertedAt = paymentDate || orderDate;
      if (paymentDate && orderDate) {
        convertedAt = new Date(Math.min(paymentDate.getTime(), orderDate.getTime()));
      }

      const baseData: Record<string, unknown> = {
        id: patient.id,
        patientId: patient.patientId,
        // Decrypt PHI fields including names
        firstName: safeDecrypt(patient.firstName),
        lastName: safeDecrypt(patient.lastName),
        gender: safeDecrypt(patient.gender),
        tags: patient.tags || [],
        medicationNames: Array.from(medicationNames),
        source: patient.source,
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        clinicName: patient.clinic?.name || null,
        status: 'patient', // Explicitly mark as converted patient
        convertedAt,
        hasPayment: !!lastPayment,
        hasOrder: !!lastOrder,
        lastPaymentAmount: lastPayment?.amount ? (lastPayment.amount / 100).toFixed(2) : null,
        lastOrderStatus: lastOrder?.status || null,
        // Sales rep assignment info
        salesRep: salesRepAssignment
          ? {
              id: salesRepAssignment.salesRep.id,
              firstName: salesRepAssignment.salesRep.firstName,
              lastName: salesRepAssignment.salesRep.lastName,
              email: salesRepAssignment.salesRep.email,
              assignedAt: salesRepAssignment.assignedAt,
            }
          : null,
        salesRepId: salesRepAssignment?.salesRepId || null,
      };

      if (includeContact) {
        baseData.email = safeDecrypt(patient.email);
        baseData.phone = safeDecrypt(patient.phone);
        baseData.dateOfBirth = safeDecrypt(patient.dob);
        const addressParts = [
          patient.address1,
          patient.address2,
          patient.city,
          patient.state,
          patient.zip,
        ].filter(Boolean);
        baseData.address = addressParts.join(', ');
      }

      return baseData;
    });

    logger.info('[ADMIN-PATIENTS] List converted patients', {
      userId: user.id,
      clinicId,
      total,
      returned: patientsData.length,
      search: search || undefined,
    });

    return NextResponse.json({
      patients: patientsData,
      meta: {
        count: patientsData.length,
        total,
        hasMore: offset + patientsData.length < total,
        type: 'patients',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-PATIENTS] Error listing patients', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch patients', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGet, { roles: [...ALLOWED_ROLES] });
