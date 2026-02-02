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
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

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
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  try {
    
    // Build where clause
    const where: {
      profileStatus: string;
      clinicId?: number;
      OR?: Array<{ firstName?: { contains: string; mode: 'insensitive' }; lastName?: { contains: string; mode: 'insensitive' }; email?: { contains: string; mode: 'insensitive' }; phone?: { contains: string } }>;
    } = {
      profileStatus: status,
    };

    // Clinic filtering for non-super-admins
    if (user.role !== 'super_admin' && user.clinicId) {
      where.clinicId = user.clinicId;
    }

    // Search filter
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

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
      profiles.map(async (profile: typeof profiles[number]) => {
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
    const stats = await prisma.patient.groupBy({
      by: ['profileStatus'],
      where: user.role !== 'super_admin' && user.clinicId 
        ? { clinicId: user.clinicId }
        : undefined,
      _count: true,
    });

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
      },
    });
  } catch (error) {
    logger.error('[Pending Profiles] Error fetching profiles', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to fetch pending profiles' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'patientId is required' },
        { status: 400 }
      );
    }

    // Verify patient exists and user has access
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        ...(user.role !== 'super_admin' && user.clinicId 
          ? { clinicId: user.clinicId } 
          : {}),
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found or access denied' },
        { status: 404 }
      );
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

        logger.info('[Pending Profiles] Profile completed', {
          patientId,
          updatedBy: user.email,
        });

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
        const { patientMergeService } = await import('@/domains/patient/services/patient-merge.service');

        const mergeResult = await patientMergeService.executeMerge({
          sourcePatientId: patientId,
          targetPatientId,
          performedBy: {
            id: user.id,
            email: user.email,
            role: user.role as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
            clinicId: user.clinicId,
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
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
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
      if (!candidates.find(c => c.id === match.id)) {
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
      if (!candidates.find(c => c.id === match.id)) {
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
export const PATCH = withAuth(handlePatch, { roles: ['super_admin', 'admin'] });
