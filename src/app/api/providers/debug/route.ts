/**
 * Provider Debug Endpoint
 * ========================
 *
 * GET /api/providers/debug
 *
 * Returns diagnostic information about why certain providers
 * may or may not appear in the provider list for the current user.
 *
 * SECURITY: Restricted to super_admin and admin roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    const diagnostics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      authenticatedUser: {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
        providerId: user.providerId,
      },
    };

    // Step 1: Get user's clinic assignments
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        clinicId: true,
        providerId: true,
        role: true,
        clinic: { select: { id: true, name: true } },
        userClinics: {
          select: {
            clinicId: true,
            clinic: { select: { name: true } },
            role: true,
            isActive: true,
            isPrimary: true,
          },
        },
      },
    });

    diagnostics.userFromDatabase = userRecord;

    // Step 2: Collect all clinic IDs (same logic as service)
    const allClinicIds: number[] = [];

    // From JWT context
    if (user.clinicId) {
      allClinicIds.push(user.clinicId);
    }

    // From User.clinicId in database
    if (userRecord?.clinicId && !allClinicIds.includes(userRecord.clinicId)) {
      allClinicIds.push(userRecord.clinicId);
    }

    // From UserClinic table
    if (userRecord?.userClinics) {
      for (const uc of userRecord.userClinics) {
        if (uc.isActive && !allClinicIds.includes(uc.clinicId)) {
          allClinicIds.push(uc.clinicId);
        }
      }
    }

    diagnostics.resolvedClinicIds = allClinicIds;

    // Step 3: Get all providers in the system
    const allProviders = await prisma.provider.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        npi: true,
        clinicId: true,
        clinic: { select: { name: true } },
        user: {
          select: {
            id: true,
            email: true,
            clinicId: true,
            userClinics: {
              where: { isActive: true },
              select: {
                clinicId: true,
                clinic: { select: { name: true } },
                role: true,
                isActive: true,
              },
            },
          },
        },
        providerClinics: {
          select: {
            clinicId: true,
            clinic: { select: { name: true } },
            isActive: true,
            isPrimary: true,
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 1000,
    });

    // Step 4: Analyze each provider's visibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerAnalysis = allProviders.map((p: any) => {
      const reasons: string[] = [];

      // Check condition 1: User's linked provider
      if (user.providerId === p.id) {
        reasons.push('✅ Condition 1: User is linked to this provider (user.providerId)');
      }

      // Check condition 2: Email match
      if (p.email && user.email.toLowerCase() === p.email.toLowerCase()) {
        reasons.push('✅ Condition 2: Provider email matches user email');
      }

      // Check condition 3: ProviderClinic junction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchingProviderClinics = p.providerClinics.filter(
        (pc: any) => allClinicIds.includes(pc.clinicId) && pc.isActive
      );
      if (matchingProviderClinics.length > 0) {
        reasons.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          `✅ Condition 3: Has ProviderClinic entries for user's clinics: ${matchingProviderClinics.map((pc: any) => pc.clinic.name).join(', ')}`
        );
      }

      // Check condition 4: Legacy clinicId
      if (p.clinicId && allClinicIds.includes(p.clinicId)) {
        reasons.push(`✅ Condition 4: Legacy clinicId (${p.clinicId}) matches user's clinics`);
      }

      // Check condition 5: Via User->UserClinic
      if (p.user?.userClinics) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchingUserClinics = p.user.userClinics.filter(
          (uc: any) => allClinicIds.includes(uc.clinicId) && uc.isActive && uc.role === 'provider'
        );
        if (matchingUserClinics.length > 0) {
          reasons.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `✅ Condition 5: Provider's User has PROVIDER role in: ${matchingUserClinics.map((uc: any) => uc.clinic.name).join(', ')}`
          );
        }
      }

      // Check condition 6: Shared provider (clinicId null)
      if (p.clinicId === null) {
        reasons.push('✅ Condition 6: Shared provider (no clinic assignment)');
      }

      const wouldAppear = reasons.length > 0;

      // Identify issues if not appearing
      const issues: string[] = [];
      if (!wouldAppear) {
        if (!p.user) {
          issues.push('❌ Provider is not linked to any User record');
        }
        if (p.providerClinics.length === 0) {
          issues.push('❌ No ProviderClinic entries exist');
        } else if (matchingProviderClinics.length === 0) {
          issues.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `❌ ProviderClinic entries exist but not for user's clinics. Has: ${p.providerClinics.map((pc: any) => `${pc.clinic.name}(active=${pc.isActive})`).join(', ')}`
          );
        }
        if (allClinicIds.length === 0) {
          issues.push('❌ User has no clinic assignments - conditions 3-5 cannot match');
        }
      }

      return {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        npi: p.npi,
        legacyClinicId: p.clinicId,
        linkedUserId: p.user?.id || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerClinics: p.providerClinics.map((pc: any) => ({
          clinic: pc.clinic.name,
          clinicId: pc.clinicId,
          isActive: pc.isActive,
        })),
        wouldAppear,
        matchReasons: reasons,
        issues,
      };
    });

    diagnostics.providerAnalysis = providerAnalysis;

    // Step 5: Summary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appearing = providerAnalysis.filter((p: any) => p.wouldAppear);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notAppearing = providerAnalysis.filter((p: any) => !p.wouldAppear);

    diagnostics.summary = {
      totalProviders: allProviders.length,
      wouldAppear: appearing.length,
      wouldNotAppear: notAppearing.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appearingProviders: appearing.map((p: any) => p.name),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notAppearingProviders: notAppearing.map((p: any) => ({
        name: p.name,
        issues: p.issues,
      })),
    };

    // Step 6: Check for users with PROVIDER role but no Provider record
    const usersWithProviderRole = await prisma.userClinic.findMany({
      where: {
        role: 'PROVIDER',
        isActive: true,
        clinicId: allClinicIds.length > 0 ? { in: allClinicIds } : undefined,
      },
      orderBy: { id: 'asc' },
      take: 1000,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            providerId: true,
          },
        },
        clinic: { select: { name: true } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersWithoutProviderRecord = usersWithProviderRole.filter(
      (uc: any) => !uc.user.providerId
    );

    if (usersWithoutProviderRecord.length > 0) {
      diagnostics.criticalIssue = {
        message: 'Users have PROVIDER role but NO linked Provider record!',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        users: usersWithoutProviderRecord.map((uc: any) => ({
          userId: uc.user.id,
          email: uc.user.email,
          name: `${uc.user.firstName} ${uc.user.lastName}`,
          clinic: uc.clinic.name,
          providerId: uc.user.providerId,
        })),
      };
    }

    return NextResponse.json(diagnostics, { status: 200 });
  },
  { roles: ['super_admin', 'admin'] }
);
