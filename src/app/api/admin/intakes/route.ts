/**
 * Admin Intakes API Route
 * =======================
 *
 * Lists patients who have NOT been converted to full patients yet.
 * An intake becomes a patient when they have a successful payment or prescription/order.
 *
 * Search uses the `searchIndex` column (populated on create/update) with a
 * pg_trgm GIN index for O(1) substring matching at any scale (10M+ records).
 *
 * Performance: Uses Prisma `none` relation filters to generate efficient
 * NOT EXISTS subqueries instead of fetching IDs separately.
 *
 * @module api/admin/intakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { splitSearchTerms } from '@/lib/utils/search';
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
 * List patients who are still intakes (no successful payment AND no order)
 *
 * Uses Prisma `none` relation filters which generate NOT EXISTS subqueries,
 * replacing the old "fetch all converted IDs → NOT IN clause" pattern.
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

    // Intakes = patients with NO successful payments AND NO orders.
    // `none` generates efficient NOT EXISTS subqueries (indexed).
    const whereClause: Prisma.PatientWhereInput = {
      payments: { none: { status: 'SUCCEEDED' } },
      orders: { none: {} },
    };

    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // Search filter using the searchIndex column (DB-level, scales to 10M+)
    if (search) {
      const terms = splitSearchTerms(search);
      const searchDigitsOnly = search.replace(/\D/g, '');
      const isPhoneSearch = searchDigitsOnly.length >= 3 && searchDigitsOnly === search.trim();

      if (isPhoneSearch) {
        whereClause.searchIndex = { contains: searchDigitsOnly, mode: 'insensitive' };
      } else if (terms.length === 1) {
        whereClause.searchIndex = { contains: terms[0], mode: 'insensitive' };
      } else {
        whereClause.AND = terms.map((term) => ({
          searchIndex: { contains: term, mode: 'insensitive' as const },
        }));
      }
    }

    // Use explicit `select` (not `include`) to avoid SELECT * on Patient.
    // Prevents failures when schema columns haven't been migrated yet.
    const [intakes, total] = await Promise.all([
      db.patient.findMany({
        where: whereClause,
        select: {
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
          clinic: {
            select: { id: true, name: true, subdomain: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.patient.count({ where: whereClause }),
    ]);

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

export const GET = withAdminAuth(handleGet);
