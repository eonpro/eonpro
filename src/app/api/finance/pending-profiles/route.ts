/**
 * Pending Profiles API
 * ====================
 *
 * Lists and manages patient profiles created from Stripe payments
 * that are incomplete and need review/completion or merging.
 *
 * GET: List pending profiles with their payment data
 * PATCH: Update a pending profile's status or complete profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma, ProfileStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';
import { normalizeSearch, splitSearchTerms, healPatientSearchIndex } from '@/lib/utils/search';

// PHI fields that need decryption
const PHI_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dob',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
] as const;

interface PendingProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  stripeCustomerId: string | null;
  createdAt: Date;
  source: string;
  sourceMetadata: Record<string, unknown> | null;
  profileStatus: string;
  notes: string | null;
  patientId: string | null;
  // Related data
  invoiceCount: number;
  totalPayments: number;
  lastPaymentDate: Date | null;
  matchCandidates?: Array<{
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    matchType: 'email' | 'phone' | 'name';
    confidence: 'high' | 'medium' | 'low';
  }>;
}

/**
 * GET /api/finance/pending-profiles
 * List all pending profiles with their related payment data
 */
async function handleGet(req: NextRequest, user: AuthUser): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const status = searchParams.get('status') || 'PENDING_COMPLETION';
  const search = searchParams.get('search')?.trim() || null;
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  try {
    // Build where clause
    // NOTE: Search is handled in-memory after decryption because PHI fields are encrypted
    const where: Prisma.PatientWhereInput = {
      profileStatus: status as ProfileStatus,
    };

    // Clinic filtering for non-super-admins
    if (user.role !== 'super_admin' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    // NOTE: Patient PHI (firstName, lastName, email, phone) is ENCRYPTED in the database.
    // SQL-level search on encrypted fields won't work.
    // For search: fetch more records, decrypt, filter in memory, then paginate.

    if (search) {
      // Fetch a larger batch for in-memory filtering (up to 500)
      const allProfiles = await prisma.patient.findMany({
        where,
        include: {
          invoices: {
            select: { id: true, amount: true, status: true, paidAt: true },
          },
          payments: {
            select: { id: true, amount: true, paidAt: true },
            orderBy: { paidAt: 'desc' },
            take: 1,
          },
          clinic: {
            select: { id: true, name: true, subdomain: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        take: 500,
      });

      // Decrypt and filter by search term
      const searchLow = normalizeSearch(search);
      const terms = splitSearchTerms(search);
      const searchDigitsOnly = search.replace(/\D/g, '');
      const filteredProfiles = allProfiles.filter((profile: (typeof allProfiles)[number]) => {
        const decrypted = decryptPatientPHI(profile, [...PHI_FIELDS]);
        const firstName = decrypted.firstName?.toLowerCase() || '';
        const lastName = decrypted.lastName?.toLowerCase() || '';
        const email = decrypted.email?.toLowerCase() || '';
        const phone = decrypted.phone?.replace(/\D/g, '') || '';

        // Single term: match any field
        if (terms.length <= 1) {
          return (
            firstName.includes(searchLow) ||
            lastName.includes(searchLow) ||
            email.includes(searchLow) ||
            (searchDigitsOnly.length >= 3 && phone.includes(searchDigitsOnly))
          );
        }

        // Multi-term: full name match or all terms somewhere
        return (
          `${firstName} ${lastName}`.includes(searchLow) ||
          `${lastName} ${firstName}`.includes(searchLow) ||
          terms.every(
            (term) =>
              firstName.includes(term) ||
              lastName.includes(term) ||
              email.includes(term)
          )
        );
      });

      // Apply pagination to filtered results
      const totalCount = filteredProfiles.length;
      const paginatedProfiles = filteredProfiles.slice((page - 1) * limit, page * limit);

      // Process the paginated profiles
      const processedProfiles = await Promise.all(
        paginatedProfiles.map(async (profile: (typeof paginatedProfiles)[number]) => {
          const decrypted = decryptPatientPHI(profile, [...PHI_FIELDS]);
          const invoiceCount = profile.invoices.length;
          const totalPayments = profile.payments.reduce(
            (sum: number, p: { amount: number }) => sum + p.amount,
            0
          );
          const lastPaymentDate = profile.payments[0]?.paidAt || null;
          const matchCandidates = await findMatchCandidates(
            decrypted,
            profile.clinicId,
            profile.id
          );

          return {
            id: decrypted.id,
            firstName: decrypted.firstName,
            lastName: decrypted.lastName,
            email: decrypted.email,
            phone: decrypted.phone,
            dob: decrypted.dob,
            address1: decrypted.address1,
            city: decrypted.city,
            state: decrypted.state,
            zip: decrypted.zip,
            stripeCustomerId: decrypted.stripeCustomerId,
            createdAt: decrypted.createdAt,
            source: decrypted.source,
            sourceMetadata: decrypted.sourceMetadata as Record<string, unknown> | null,
            profileStatus: decrypted.profileStatus,
            notes: decrypted.notes,
            patientId: decrypted.patientId,
            clinic: profile.clinic,
            invoiceCount,
            totalPayments,
            lastPaymentDate,
            matchCandidates,
          };
        })
      );

      // Get summary stats
      const searchClinicFilter =
        user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : undefined;

      const [searchStats, searchInvoicesBlocked] = await Promise.all([
        prisma.patient.groupBy({
          by: ['profileStatus'],
          where: searchClinicFilter,
          _count: true,
        }),
        prisma.invoice.count({
          where: {
            status: 'PAID',
            prescriptionProcessed: false,
            patient: { profileStatus: 'PENDING_COMPLETION' },
            ...(searchClinicFilter?.clinicId ? { clinicId: searchClinicFilter.clinicId } : {}),
          },
        }),
      ]);

      const statusCounts = searchStats.reduce(
        (acc: Record<string, number>, s: { profileStatus: string; _count: number }) => {
          acc[s.profileStatus] = s._count;
          return acc;
        },
        {} as Record<string, number>
      );

      return NextResponse.json({
        profiles: processedProfiles,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        stats: {
          pendingCompletion: statusCounts['PENDING_COMPLETION'] || 0,
          active: statusCounts['ACTIVE'] || 0,
          merged: statusCounts['MERGED'] || 0,
          archived: statusCounts['ARCHIVED'] || 0,
          invoicesAwaitingProfileCompletion: searchInvoicesBlocked,
        },
      });
    }

    // No search: use normal DB pagination
    // Get total count
    const totalCount = await prisma.patient.count({ where });

    // Get pending profiles with aggregations
    const profiles = await prisma.patient.findMany({
      where,
      include: {
        invoices: {
          select: {
            id: true,
            amount: true,
            status: true,
            paidAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            paidAt: true,
          },
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Process profiles and find match candidates
    const processedProfiles = await Promise.all(
      profiles.map(async (profile: (typeof profiles)[number]) => {
        // Decrypt PHI
        const decrypted = decryptPatientPHI(profile, [...PHI_FIELDS]);

        // Calculate aggregations
        const invoiceCount = profile.invoices.length;
        const totalPayments = profile.payments.reduce(
          (sum: number, p: { amount: number }) => sum + p.amount,
          0
        );
        const lastPaymentDate = profile.payments[0]?.paidAt || null;

        // Find potential match candidates (patients with similar data)
        const matchCandidates = await findMatchCandidates(decrypted, profile.clinicId, profile.id);

        return {
          id: decrypted.id,
          firstName: decrypted.firstName,
          lastName: decrypted.lastName,
          email: decrypted.email,
          phone: decrypted.phone,
          dob: decrypted.dob,
          address1: decrypted.address1,
          city: decrypted.city,
          state: decrypted.state,
          zip: decrypted.zip,
          stripeCustomerId: decrypted.stripeCustomerId,
          createdAt: decrypted.createdAt,
          source: decrypted.source,
          sourceMetadata: decrypted.sourceMetadata as Record<string, unknown> | null,
          profileStatus: decrypted.profileStatus,
          notes: decrypted.notes,
          patientId: decrypted.patientId,
          clinic: profile.clinic,
          invoiceCount,
          totalPayments,
          lastPaymentDate,
          matchCandidates,
        };
      })
    );

    // Get summary stats
    const clinicFilter =
      user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : undefined;

    const [stats, invoicesBlockedByProfile] = await Promise.all([
      prisma.patient.groupBy({
        by: ['profileStatus'],
        where: clinicFilter,
        _count: true,
      }),
      // Count paid invoices blocked from the Rx queue because patient profile is incomplete
      prisma.invoice.count({
        where: {
          status: 'PAID',
          prescriptionProcessed: false,
          patient: { profileStatus: 'PENDING_COMPLETION' },
          ...(clinicFilter?.clinicId ? { clinicId: clinicFilter.clinicId } : {}),
        },
      }),
    ]);

    const statusCounts = stats.reduce(
      (acc: Record<string, number>, s: { profileStatus: string; _count: number }) => {
        acc[s.profileStatus] = s._count;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      profiles: processedProfiles,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      stats: {
        pendingCompletion: statusCounts['PENDING_COMPLETION'] || 0,
        active: statusCounts['ACTIVE'] || 0,
        merged: statusCounts['MERGED'] || 0,
        archived: statusCounts['ARCHIVED'] || 0,
        // Paid invoices blocked from Rx queue until profiles are completed
        invoicesAwaitingProfileCompletion: invoicesBlockedByProfile,
      },
    });
  } catch (error) {
    logger.error('[Pending Profiles] Error fetching profiles', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch pending profiles' }, { status: 500 });
  }
}

/**
 * PATCH /api/finance/pending-profiles
 * Update a pending profile (complete profile or change status)
 */
async function handlePatch(req: NextRequest, user: AuthUser): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      patientId,
      action,
      updates,
      targetPatientId, // For merge operation
    } = body;

    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    // Providers can only perform merge actions — complete/archive require admin
    if (user.role === 'provider' && action !== 'merge') {
      return NextResponse.json(
        { error: 'Providers can only merge profiles. Complete and archive actions require admin access.' },
        { status: 403 }
      );
    }

    // Verify patient exists and user has access
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        ...(user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : {}),
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found or access denied' }, { status: 404 });
    }

    switch (action) {
      case 'complete': {
        // Mark profile as complete after updating with real data
        if (!updates || (!updates.email && !updates.firstName)) {
          return NextResponse.json(
            { error: 'Must provide email or name to complete profile' },
            { status: 400 }
          );
        }

        const updatedPatient = await prisma.patient.update({
          where: { id: patientId },
          data: {
            ...updates,
            profileStatus: 'ACTIVE',
            notes: patient.notes
              ? patient.notes.replace('⚠️ PENDING COMPLETION:', '✅ COMPLETED:')
              : 'Profile completed.',
          },
        });

        healPatientSearchIndex(prisma, patientId).catch(() => {});

        logger.info('[Pending Profiles] Profile completed', {
          patientId,
          updatedBy: user.id,
        });

        // CRITICAL: When a profile is completed, paid invoices will now flow to the
        // provider prescription queue. Ensure SOAP notes exist for those invoices so
        // providers have clinical documentation when prescribing.
        try {
          const paidInvoices = await prisma.invoice.findMany({
            where: {
              patientId,
              status: 'PAID',
              prescriptionProcessed: false,
            },
            select: { id: true },
          });

          if (paidInvoices.length > 0) {
            const { ensureSoapNoteExists } = await import('@/lib/soap-note-automation');
            for (const inv of paidInvoices) {
              try {
                await ensureSoapNoteExists(patientId, inv.id);
              } catch (soapErr) {
                logger.warn('[Pending Profiles] SOAP note generation failed for invoice', {
                  invoiceId: inv.id,
                  patientId,
                  error: soapErr instanceof Error ? soapErr.message : 'Unknown',
                });
              }
            }
            logger.info('[Pending Profiles] SOAP notes ensured for paid invoices moving to Rx queue', {
              patientId,
              invoiceCount: paidInvoices.length,
            });
          }
        } catch (soapError) {
          logger.warn('[Pending Profiles] Non-fatal: failed to ensure SOAP notes on profile completion', {
            patientId,
            error: soapError instanceof Error ? soapError.message : 'Unknown',
          });
        }

        return NextResponse.json({
          success: true,
          patient: updatedPatient,
          message: 'Profile completed successfully',
        });
      }

      case 'archive': {
        // Archive the profile (soft delete)
        await prisma.patient.update({
          where: { id: patientId },
          data: {
            profileStatus: 'ARCHIVED',
            notes: `${patient.notes || ''}\n\n[Archived by ${user.email} on ${new Date().toISOString()}]`,
          },
        });

        logger.info('[Pending Profiles] Profile archived', {
          patientId,
          archivedBy: user.email,
        });

        return NextResponse.json({
          success: true,
          message: 'Profile archived successfully',
        });
      }

      case 'merge': {
        // Merge into another patient using the patient merge service
        if (!targetPatientId) {
          return NextResponse.json(
            { error: 'targetPatientId is required for merge' },
            { status: 400 }
          );
        }

        // Import merge service dynamically
        const { patientMergeService } =
          await import('@/domains/patient/services/patient-merge.service');

        const mergeResult = await patientMergeService.executeMerge({
          sourcePatientId: patientId,
          targetPatientId,
          performedBy: {
            id: user.id,
            email: user.email,
            role: user.role as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
            clinicId: user.clinicId,
            providerId: user.providerId,
          },
        });

        logger.info('[Pending Profiles] Profile merged', {
          sourcePatientId: patientId,
          targetPatientId,
          recordsMoved: mergeResult.recordsMoved,
          mergedBy: user.email,
        });

        return NextResponse.json({
          success: true,
          mergedPatient: mergeResult.mergedPatient,
          recordsMoved: mergeResult.recordsMoved,
          message: `Successfully merged into patient ${targetPatientId}. ${mergeResult.recordsMoved} records moved.`,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[Pending Profiles] Error updating profile', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update profile' },
      { status: 500 }
    );
  }
}

/**
 * Find potential match candidates for a pending profile
 */
async function findMatchCandidates(
  profile: { email: string; phone: string; firstName: string; lastName: string },
  clinicId: number,
  excludeId: number
): Promise<PendingProfile['matchCandidates']> {
  const candidates: PendingProfile['matchCandidates'] = [];

  // Skip if profile has placeholder data
  const hasRealEmail = profile.email && !profile.email.includes('@placeholder.local');
  const hasRealName = profile.firstName !== 'Unknown' && profile.lastName !== 'Customer';
  const hasRealPhone = profile.phone && profile.phone.length > 5;

  if (!hasRealEmail && !hasRealName && !hasRealPhone) {
    return candidates;
  }

  // Find by email (high confidence)
  if (hasRealEmail) {
    const emailMatches = await prisma.patient.findMany({
      where: {
        id: { not: excludeId },
        clinicId,
        profileStatus: 'ACTIVE',
        email: { equals: profile.email, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 3,
    });

    for (const match of emailMatches) {
      const decrypted = decryptPatientPHI(match, ['firstName', 'lastName', 'email']);
      candidates.push({
        id: decrypted.id,
        firstName: decrypted.firstName,
        lastName: decrypted.lastName,
        email: decrypted.email,
        matchType: 'email',
        confidence: 'high',
      });
    }
  }

  // Find by phone (medium confidence)
  if (hasRealPhone && candidates.length < 5) {
    const normalizedPhone = profile.phone.replace(/\D/g, '');
    const phoneMatches = await prisma.patient.findMany({
      where: {
        id: { not: excludeId },
        clinicId,
        profileStatus: 'ACTIVE',
        phone: { contains: normalizedPhone.slice(-10) },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 3,
    });

    for (const match of phoneMatches) {
      if (!candidates.find((c) => c.id === match.id)) {
        const decrypted = decryptPatientPHI(match, ['firstName', 'lastName', 'email']);
        candidates.push({
          id: decrypted.id,
          firstName: decrypted.firstName,
          lastName: decrypted.lastName,
          email: decrypted.email,
          matchType: 'phone',
          confidence: 'medium',
        });
      }
    }
  }

  // Find by name (low confidence)
  if (hasRealName && candidates.length < 5) {
    const nameMatches = await prisma.patient.findMany({
      where: {
        id: { not: excludeId },
        clinicId,
        profileStatus: 'ACTIVE',
        firstName: { equals: profile.firstName, mode: 'insensitive' },
        lastName: { equals: profile.lastName, mode: 'insensitive' },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 3,
    });

    for (const match of nameMatches) {
      if (!candidates.find((c) => c.id === match.id)) {
        const decrypted = decryptPatientPHI(match, ['firstName', 'lastName', 'email']);
        candidates.push({
          id: decrypted.id,
          firstName: decrypted.firstName,
          lastName: decrypted.lastName,
          email: decrypted.email,
          matchType: 'name',
          confidence: 'low',
        });
      }
    }
  }

  return candidates;
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin', 'provider', 'staff'] });
export const PATCH = withAuth(handlePatch, { roles: ['super_admin', 'admin', 'provider'] });
