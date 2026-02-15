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
 * @module api/admin/patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { AGGREGATION_TAKE_UI, parseTakeFromParams } from '@/lib/pagination';
import { normalizeSearch, splitSearchTerms } from '@/lib/utils/search';

const PAGE_SIZE = 25;

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
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseTakeFromParams(searchParams);
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const search = (searchParams.get('search') || '').trim();
    const includeContact = searchParams.get('includeContact') === 'true';
    const salesRepId = searchParams.get('salesRepId'); // Filter by specific sales rep (admin only)

    // Get clinic context for non-super-admin users
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    // For sales_rep role, get only their assigned patient IDs
    let assignedPatientIds: number[] | null = null;
    if (user.role === 'sales_rep') {
      const assignments = await prisma.patientSalesRepAssignment.findMany({
        where: {
          salesRepId: user.id,
          clinicId: user.clinicId!,
          isActive: true,
        },
        select: { patientId: true },
        take: AGGREGATION_TAKE_UI,
      });
      const mappedIds = assignments.map((a: { patientId: number }) => a.patientId);
      assignedPatientIds = mappedIds;

      // If sales rep has no assigned patients, return empty result
      if (mappedIds.length === 0) {
        return NextResponse.json({
          patients: [],
          meta: {
            count: 0,
            total: 0,
            hasMore: false,
            type: 'patients',
          },
        });
      }
    }

    // Get all patient IDs that have successful payments or orders (converted patients); capped for scale
    const [patientsWithPayments, patientsWithOrders] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: 'SUCCEEDED',
          ...(clinicId && { patient: { clinicId } }),
        },
        select: { patientId: true },
        distinct: ['patientId'],
        take: AGGREGATION_TAKE_UI,
      }),
      prisma.order.findMany({
        where: {
          ...(clinicId && { patient: { clinicId } }),
        },
        select: { patientId: true },
        distinct: ['patientId'],
        take: AGGREGATION_TAKE_UI,
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

    // For sales rep, intersect with assigned patients
    let filteredIds = Array.from(convertedIds);
    if (assignedPatientIds !== null) {
      const assignedSet = new Set(assignedPatientIds);
      filteredIds = filteredIds.filter((id) => assignedSet.has(id));
    }

    // Build where clause for converted patients only
    const whereClause: Record<string, unknown> = {
      id: { in: filteredIds },
    };

    // Add clinic filter for non-super-admin
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    // Admin can filter by specific sales rep
    if (salesRepId && (user.role === 'admin' || user.role === 'super_admin')) {
      const salesRepAssignments = await prisma.patientSalesRepAssignment.findMany({
        where: {
          salesRepId: parseInt(salesRepId, 10),
          isActive: true,
          ...(clinicId && { clinicId }),
        },
        select: { patientId: true },
        take: AGGREGATION_TAKE_UI,
      });
      const salesRepPatientIds = salesRepAssignments.map((a: { patientId: number }) => a.patientId);
      whereClause.id = { in: filteredIds.filter((id) => salesRepPatientIds.includes(id)) };
    }

    // Add search filter using the searchIndex column (DB-level, scales to 10M+)
    if (search) {
      const terms = splitSearchTerms(search);
      const searchDigitsOnly = search.replace(/\D/g, '');

      // For phone-only searches (all digits, 3+ chars), search by digits
      const isPhoneSearch = searchDigitsOnly.length >= 3 && searchDigitsOnly === search.trim();

      if (isPhoneSearch) {
        whereClause.searchIndex = { contains: searchDigitsOnly, mode: 'insensitive' };
      } else if (terms.length === 1) {
        whereClause.searchIndex = { contains: terms[0], mode: 'insensitive' };
      } else {
        // Multi-term: ALL terms must appear in searchIndex
        whereClause.AND = terms.map((term) => ({
          searchIndex: { contains: term, mode: 'insensitive' },
        }));
      }
    }

    // Execute query with DB-level search + pagination
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: whereClause,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
          // Include payments (for display + invoice items for medication names)
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { paidAt: 'desc' },
            take: 5,
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
          // Include recent orders with rx/medication info for Treatment column
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 5,
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
          // Include active sales rep assignment
          salesRepAssignments: {
            where: { isActive: true },
            take: 1,
            select: {
              id: true,
              salesRepId: true,
              assignedAt: true,
              salesRep: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.patient.count({ where: whereClause }),
    ]);

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
