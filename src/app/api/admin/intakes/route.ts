/**
 * Admin Intakes API Route
 * =======================
 *
 * Lists patients who have NOT been converted to full patients yet.
 * An intake becomes a patient when they have a successful payment or prescription/order.
 *
 * @module api/admin/intakes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { AGGREGATION_TAKE } from '@/lib/pagination';

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
 * List patients who are still intakes (no payment or order)
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || '';
    const includeContact = searchParams.get('includeContact') === 'true';

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // First, get all patient IDs that have successful payments or orders (converted patients)
    const [patientsWithPayments, patientsWithOrders] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: 'SUCCEEDED',
          ...(clinicId && { patient: { clinicId } }),
        },
        select: { patientId: true },
        distinct: ['patientId'],
        take: AGGREGATION_TAKE,
      }),
      prisma.order.findMany({
        where: {
          ...(clinicId && { patient: { clinicId } }),
        },
        select: { patientId: true },
        distinct: ['patientId'],
        take: AGGREGATION_TAKE,
      }),
    ]);

    // Combine to get all converted patient IDs
    const convertedIds = new Set<number>();
    for (const p of patientsWithPayments) {
      convertedIds.add(p.patientId);
    }
    for (const o of patientsWithOrders) {
      convertedIds.add(o.patientId);
    }

    // Build where clause for intakes (exclude converted patients)
    const whereClause: Record<string, unknown> = {
      id: { notIn: Array.from(convertedIds) },
    };

    // Add clinic filter for non-super-admin
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // NOTE: Patient names and emails are ENCRYPTED in the database.
    // We cannot use SQL LIKE/CONTAINS on encrypted fields.
    // For search: fetch all, decrypt, then filter in memory.

    // Only add patientId search at DB level (it's not encrypted)
    if (search && !search.includes('@')) {
      whereClause.OR = [{ patientId: { contains: search, mode: 'insensitive' } }];
    }

    // Query intakes - fetch more for search filtering
    const fetchLimit = search ? 2000 : limit;
    const fetchOffset = search ? 0 : offset;

    const baseWhere = {
      id: { notIn: Array.from(convertedIds) },
      ...(clinicId && { clinicId }),
    };

    const [intakes, totalWithoutSearch] = await Promise.all([
      prisma.patient.findMany({
        where: search ? baseWhere : whereClause,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        skip: fetchOffset,
      }),
      prisma.patient.count({ where: search ? baseWhere : whereClause }),
    ]);

    // For search: decrypt and filter in memory
    let filteredIntakes = intakes;
    let total = totalWithoutSearch;

    if (search) {
      const searchLower = search.toLowerCase().trim();
      const searchTerms = searchLower.split(/\s+/).filter(Boolean);

      filteredIntakes = intakes.filter((patient: (typeof intakes)[number]) => {
        const decryptedFirst = safeDecrypt(patient.firstName)?.toLowerCase() || '';
        const decryptedLast = safeDecrypt(patient.lastName)?.toLowerCase() || '';
        const decryptedEmail = safeDecrypt(patient.email)?.toLowerCase() || '';
        const patientIdLower = patient.patientId?.toLowerCase() || '';

        return (
          searchTerms.some(
            (term) =>
              decryptedFirst.includes(term) ||
              decryptedLast.includes(term) ||
              decryptedEmail.includes(term) ||
              patientIdLower.includes(term)
          ) ||
          (searchTerms.length >= 2 && (decryptedFirst + ' ' + decryptedLast).includes(searchLower))
        );
      });

      total = filteredIntakes.length;
      filteredIntakes = filteredIntakes.slice(offset, offset + limit);
    }

    // Transform response - minimize PHI unless explicitly requested
    const patients = filteredIntakes.map((patient: (typeof intakes)[number]) => {
      const baseData: Record<string, unknown> = {
        id: patient.id,
        patientId: patient.patientId,
        // Decrypt PHI fields including names
        firstName: safeDecrypt(patient.firstName),
        lastName: safeDecrypt(patient.lastName),
        gender: safeDecrypt(patient.gender),
        tags: patient.tags || [],
        source: patient.source,
        createdAt: patient.createdAt,
        clinicId: patient.clinicId,
        clinicName: patient.clinic?.name || null,
        status: 'intake', // Explicitly mark as intake
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
