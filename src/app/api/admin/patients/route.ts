/**
 * Admin Patients API Route
 * ========================
 *
 * Lists patients who have an invoice and/or a prescription (order).
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
import { splitSearchTerms, buildPatientSearchWhere, buildPatientSearchIndex, buildIncompleteSearchIndexWhere } from '@/lib/utils/search';
import { Prisma, PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@/lib/auth/permissions';

const SALES_REP_VIEW_ALL_PATIENTS = PERMISSIONS.SALES_REP_VIEW_ALL_PATIENTS;

// Roles that can access this endpoint (provider/staff may use admin Patients page)
const ALLOWED_ROLES = ['super_admin', 'admin', 'sales_rep', 'provider', 'staff'] as const;

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
 * List patients who have an invoice and/or a prescription (order).
 * For sales_rep role, only shows patients assigned to them.
 *
 * Uses Prisma `some` relation filters which generate efficient
 * EXISTS subqueries (indexed, stops at first match).
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

    // Patients = those with at least one invoice OR at least one order/prescription.
    const whereClause: Prisma.PatientWhereInput = {
      OR: [
        { invoices: { some: {} } },
        { orders: { some: {} } },
      ],
    };

    // Clinic filter (explicit for basePrisma; redundant but harmless for wrapped prisma)
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // Sales rep: only assigned patients unless admin granted "view all patients"
    const salesRepCanViewAll = Boolean(
      user.permissions && user.permissions.includes(SALES_REP_VIEW_ALL_PATIENTS)
    );
    if (user.role === 'sales_rep' && !salesRepCanViewAll) {
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

    // Search filter using unified buildPatientSearchWhere (single source of truth).
    // Handles multi-term AND logic, phone search, and patientId matching.
    // Patients with NULL searchIndex are handled via a fallback query below.
    //
    // Use AND to compose search filter with base where clause, avoiding
    // Object.assign which would overwrite the base OR (invoice/order constraint)
    // when the search filter also contains an OR key.
    if (search) {
      const searchFilter = buildPatientSearchWhere(search);
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
        searchFilter,
      ];
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
      invoices: {
        orderBy: { createdAt: 'desc' as const },
        take: 3,
        select: {
          id: true,
          amount: true,
          amountPaid: true,
          status: true,
          paidAt: true,
          createdAt: true,
          items: {
            select: {
              description: true,
              product: { select: { name: true } },
            },
          },
        },
      },
      payments: {
        where: { status: 'SUCCEEDED' as const },
        orderBy: { paidAt: 'desc' as const },
        take: 3,
        select: {
          paidAt: true,
          amount: true,
          invoiceId: true,
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

    // Phase 2: Fallback for patients with NULL/empty/incomplete searchIndex
    // These patients were created before searchIndex was added, through code
    // paths that didn't populate it, or have only a patientId token (no name).
    // We scan ALL such patients in chunks so every patient is findable.
    // Matched patients are self-healed: searchIndex is backfilled so next search uses the fast path.
    const FALLBACK_CHUNK_SIZE = 500;
    const FALLBACK_MAX_SCAN = 10_000;
    let fallbackPatients: typeof indexedPatients = [];
    if (search) {
      const fallbackWhere: Prisma.PatientWhereInput = {
        ...baseWhere,
        ...buildIncompleteSearchIndexWhere(),
      };

      const unindexedCount = await db.patient.count({ where: fallbackWhere });

      if (unindexedCount > 0) {
        const terms = splitSearchTerms(search);
        const searchLower = search.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');

        const matches: typeof indexedPatients = [];
        const selfHealUpdates: Array<{ id: number; searchIndex: string }> = [];
        let cursorId: number | undefined;
        let totalScanned = 0;

        while (totalScanned < FALLBACK_MAX_SCAN) {
          const chunk = await db.patient.findMany({
            where: {
              ...fallbackWhere,
              ...(cursorId !== undefined ? { id: { gt: cursorId } } : {}),
            },
            select: patientSelect,
            orderBy: { id: 'asc' },
            take: FALLBACK_CHUNK_SIZE,
          });

          if (chunk.length === 0) break;
          totalScanned += chunk.length;
          cursorId = chunk[chunk.length - 1]?.id;

          for (const p of chunk) {
            const fn = safeDecrypt(p.firstName)?.toLowerCase() || '';
            const ln = safeDecrypt(p.lastName)?.toLowerCase() || '';
            const em = safeDecrypt(p.email)?.toLowerCase() || '';
            const ph = (safeDecrypt(p.phone) || '').replace(/\D/g, '');
            const pid = (p.patientId || '').toLowerCase();

            let matchesSearch: boolean;
            if (terms.length === 1) {
              const t = terms[0];
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
                terms.every(
                  (t) => fn.includes(t) || ln.includes(t) || pid.includes(t) || em.includes(t)
                );
            }

            if (matchesSearch) {
              matches.push(p);
              const idx = buildPatientSearchIndex({
                firstName: fn || null,
                lastName: ln || null,
                email: em || null,
                phone: ph || null,
                patientId: pid || null,
              });
              if (idx) selfHealUpdates.push({ id: p.id, searchIndex: idx });
            }
          }

          if (chunk.length < FALLBACK_CHUNK_SIZE) break;
        }

        if (totalScanned >= FALLBACK_MAX_SCAN && totalScanned < unindexedCount) {
          logger.warn('[ADMIN-PATIENTS] Fallback scan cap reached — run backfill for full coverage', {
            unindexedCount,
            scanned: totalScanned,
            recommendation: 'POST /api/admin/backfill-search-index',
          });
        }

        fallbackPatients = matches;

        // Self-heal: backfill searchIndex for matched unindexed patients (fire-and-forget)
        if (selfHealUpdates.length > 0) {
          Promise.all(
            selfHealUpdates.map(({ id, searchIndex }) =>
              db.patient.update({ where: { id }, data: { searchIndex } }).catch((err) => {
                logger.warn('[ADMIN-PATIENTS] Self-heal searchIndex failed', { patientId: id, error: String(err) });
              })
            )
          ).then(() => {
            if (selfHealUpdates.length > 0) {
              logger.info('[ADMIN-PATIENTS] Self-healed searchIndex for patients', {
                count: selfHealUpdates.length,
                ids: selfHealUpdates.map((u) => u.id),
              });
            }
          });
        }

        logger.info('[ADMIN-PATIENTS] Fallback search completed', {
          unindexedCount,
          totalScanned,
          matchesFound: fallbackPatients.length,
          selfHealed: selfHealUpdates.length,
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
      const lastInvoice = patient.invoices?.[0];
      const lastPayment = patient.payments?.[0];
      const lastOrder = patient.orders?.[0];
      const salesRepAssignment = patient.salesRepAssignments?.[0];

      // Build medication names from orders and invoice items
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
      for (const inv of patient.invoices || []) {
        if (!inv?.items) continue;
        for (const item of inv.items) {
          const name = item.product?.name?.trim() || item.description?.trim();
          if (name && name.length > 2) medicationNames.add(name);
        }
      }

      const invoiceDate = lastInvoice?.createdAt;
      const orderDate = lastOrder?.createdAt;
      let convertedAt = invoiceDate || orderDate;
      if (invoiceDate && orderDate) {
        convertedAt = new Date(Math.min(new Date(invoiceDate).getTime(), new Date(orderDate).getTime()));
      }

      const baseData: Record<string, unknown> = {
        id: patient.id,
        patientId: patient.patientId,
        firstName: safeDecrypt(patient.firstName),
        lastName: safeDecrypt(patient.lastName),
        gender: safeDecrypt(patient.gender),
        tags: Array.isArray(patient.tags) ? patient.tags : [],
        medicationNames: Array.from(medicationNames),
        source: patient.source,
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        clinicName: patient.clinic?.name || null,
        status: 'patient',
        convertedAt,
        hasInvoice: !!lastInvoice,
        hasOrder: !!lastOrder,
        hasPayment: !!lastPayment,
        lastInvoiceAmount: lastInvoice?.amount ? (lastInvoice.amount / 100).toFixed(2) : null,
        lastOrderStatus: lastOrder?.status || null,
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

    logger.info('[ADMIN-PATIENTS] List patients with invoices/prescriptions', {
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
