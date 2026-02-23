/**
 * Admin Intakes API Route
 * =======================
 *
 * Lists ALL patient profiles regardless of invoice or prescription status.
 * This is the comprehensive view of every patient in the system.
 *
 * Search uses the `searchIndex` column (populated on create/update) with a
 * pg_trgm GIN index for O(1) substring matching at any scale (10M+ records).
 *
 * @module api/admin/intakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { splitSearchTerms, buildPatientSearchWhere, buildPatientSearchIndex } from '@/lib/utils/search';
import { Prisma, PrismaClient } from '@prisma/client';

const PAGE_SIZE = 25;

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    const parts = value.split(':');
    // Min length of 2 to handle short encrypted values
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
 * GET /api/admin/intakes
 * List ALL patients — the comprehensive directory of every profile in the system.
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = (searchParams.get('search') || '').trim();
    const includeContact = searchParams.get('includeContact') === 'true';

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // Super admin has no clinic context → clinic-filtered prisma throws.
    // basePrisma.patient is in BASE_PRISMA_ALLOWLIST.
    const db = (user.role === 'super_admin' ? basePrisma : prisma) as PrismaClient;

    // Show ALL patients — no exclusion filter.
    const whereClause: Prisma.PatientWhereInput = {};

    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // Save base WHERE before adding search filter (used for fallback query)
    const baseWhere: Prisma.PatientWhereInput = { ...whereClause };

    // Search filter using unified buildPatientSearchWhere (single source of truth).
    // Handles multi-term AND logic, phone search, and patientId matching.
    // Patients with NULL searchIndex are handled via a fallback query below.
    if (search) {
      const searchFilter = buildPatientSearchWhere(search);
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
        searchFilter,
      ];
    }

    // Use explicit `select` (not `include`) to avoid SELECT * on Patient.
    // Prevents failures when schema columns haven't been migrated yet.
    const intakeSelect = {
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
    } as const;

    // Phase 1: Main query using searchIndex (fast path for indexed patients)
    const [indexedIntakes, indexedTotal] = await Promise.all([
      db.patient.findMany({
        where: whereClause,
        select: intakeSelect,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.patient.count({ where: whereClause }),
    ]);

    // Phase 2: Fallback for patients with NULL/empty searchIndex (scan all unindexed in chunks; self-heal on match)
    const FALLBACK_CHUNK_SIZE = 500;
    const FALLBACK_MAX_SCAN = 10_000;
    let fallbackIntakes: typeof indexedIntakes = [];
    if (search) {
      const fallbackWhere: Prisma.PatientWhereInput = {
        ...baseWhere,
        AND: [{ OR: [{ searchIndex: null }, { searchIndex: '' }] }],
      };

      const unindexedCount = await db.patient.count({ where: fallbackWhere });

      if (unindexedCount > 0) {
        const terms = splitSearchTerms(search);
        const searchLower = search.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');
        const matches: typeof indexedIntakes = [];
        const selfHealUpdates: Array<{ id: number; searchIndex: string }> = [];
        let cursorId: number | undefined;
        let totalScanned = 0;

        while (totalScanned < FALLBACK_MAX_SCAN) {
          const chunk = await db.patient.findMany({
            where: {
              ...fallbackWhere,
              ...(cursorId !== undefined ? { id: { gt: cursorId } } : {}),
            },
            select: intakeSelect,
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
          logger.warn('[ADMIN-INTAKES] Fallback scan cap reached — run backfill for full coverage', {
            unindexedCount,
            scanned: totalScanned,
            recommendation: 'POST /api/admin/backfill-search-index',
          });
        }

        fallbackIntakes = matches;

        if (selfHealUpdates.length > 0) {
          Promise.all(
            selfHealUpdates.map(({ id, searchIndex }) =>
              db.patient.update({ where: { id }, data: { searchIndex } }).catch((err) => {
                logger.warn('[ADMIN-INTAKES] Self-heal searchIndex failed', { patientId: id, error: String(err) });
              })
            )
          ).then(() => {
            if (selfHealUpdates.length > 0) {
              logger.info('[ADMIN-INTAKES] Self-healed searchIndex for patients', {
                count: selfHealUpdates.length,
                ids: selfHealUpdates.map((u) => u.id),
              });
            }
          });
        }

        logger.info('[ADMIN-INTAKES] Fallback search completed', {
          unindexedCount,
          totalScanned,
          matchesFound: fallbackIntakes.length,
          selfHealed: selfHealUpdates.length,
          searchQuery: search,
        });
      }
    }

    // Combine indexed + fallback results, deduplicating by ID
    const seenIds = new Set(indexedIntakes.map((p) => p.id));
    const uniqueFallback = fallbackIntakes.filter((p) => !seenIds.has(p.id));
    const intakes = [...indexedIntakes, ...uniqueFallback];
    const total = indexedTotal + uniqueFallback.length;

    // Transform response - minimize PHI unless explicitly requested
    const patients = intakes.map((patient) => {
      const baseData: Record<string, unknown> = {
        id: patient.id,
        patientId: patient.patientId,
        firstName: safeDecrypt(patient.firstName),
        lastName: safeDecrypt(patient.lastName),
        gender: safeDecrypt(patient.gender),
        tags: patient.tags || [],
        source: patient.source,
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        clinicName: patient.clinic?.name || null,
        status: 'intake',
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

    logger.info('[ADMIN-INTAKES] List intakes', {
      userId: user.id,
      clinicId,
      total,
      returned: patients.length,
      search: search || undefined,
    });

    return NextResponse.json({
      patients,
      meta: {
        count: patients.length,
        total,
        hasMore: offset + patients.length < total,
        type: 'intakes',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[ADMIN-INTAKES] Error listing intakes', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch intakes', details: errorMessage },
      { status: 500 }
    );
  }
}

// Clinical roles (admin, provider, staff) can list intakes; matches admin layout allowedAdminRoles.
export const GET = withClinicalAuth(handleGet);
