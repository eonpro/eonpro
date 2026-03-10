import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withClinicalAuth, type AuthUser } from '@/lib/auth/middleware';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { getProviderIdForUser } from '@/lib/auth/get-provider-for-user';
import { doseSpotSSOService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const configured = await isClinicDoseSpotConfigured(clinicId);
    if (!configured) {
      return NextResponse.json(
        { error: 'DoseSpot is not configured for this clinic' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const prescriberIdParam = searchParams.get('prescriberId');
    const patientIdParam = searchParams.get('patientId');
    if (!patientIdParam) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    const clinicProviderScope = {
      status: 'ACTIVE' as const,
      OR: [
        { clinicId },
        {
          providerClinics: {
            some: {
              clinicId,
              isActive: true,
            },
          },
        },
        {
          user: {
            OR: [
              { clinicId },
              {
                userClinics: {
                  some: {
                    clinicId,
                    isActive: true,
                  },
                },
              },
            ],
          },
        },
      ],
    };

    const resolveProviderFromAuthenticatedIdentity = async (): Promise<number | null> => {
      if (user.email) {
        const byEmail = await prisma.provider.findFirst({
          where: {
            ...clinicProviderScope,
            email: { equals: user.email, mode: 'insensitive' },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        if (byEmail) return byEmail.id;

        const emailLocalPart = user.email.split('@')[0]?.trim().toLowerCase();
        if (emailLocalPart && emailLocalPart.length >= 3) {
          const byEmailLocalPart = await prisma.provider.findMany({
            where: {
              ...clinicProviderScope,
              email: { contains: `${emailLocalPart}@`, mode: 'insensitive' },
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 2,
          });
          if (byEmailLocalPart.length === 1) return byEmailLocalPart[0]!.id;
        }
      }

      const authUserIdentity = await prisma.user.findUnique({
        where: { id: user.id },
        select: { firstName: true, lastName: true },
      });
      if (!authUserIdentity?.firstName || !authUserIdentity?.lastName) return null;

      const byName = await prisma.provider.findMany({
        where: {
          ...clinicProviderScope,
          firstName: { equals: authUserIdentity.firstName, mode: 'insensitive' },
          lastName: { equals: authUserIdentity.lastName, mode: 'insensitive' },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2,
      });
      if (byName.length === 1) return byName[0]!.id;

      // Fuzzy fallback for minor name drift (e.g., middle names/abbreviations)
      const byNameFuzzy = await prisma.provider.findMany({
        where: {
          ...clinicProviderScope,
          firstName: { contains: authUserIdentity.firstName, mode: 'insensitive' },
          lastName: { contains: authUserIdentity.lastName, mode: 'insensitive' },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2,
      });
      return byNameFuzzy.length === 1 ? byNameFuzzy[0]!.id : null;
    };

    const linkedProviderId = await getProviderIdForUser(user);
    let prescriberId: number | null = null;
    if (user.role === 'provider') {
      // Providers must always use their linked Provider record.
      prescriberId = linkedProviderId;
    } else if (prescriberIdParam) {
      const parsed = parseInt(prescriberIdParam, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: 'prescriberId must be a positive integer' }, { status: 400 });
      }
      prescriberId = parsed;
    } else if (linkedProviderId) {
      prescriberId = linkedProviderId;
    } else if (user.providerId) {
      // Legacy fallback for stale links where DB refresh may not have resolved yet.
      prescriberId = user.providerId;
    } else {
      prescriberId = null;
    }

    if (!prescriberId) {
      const identityProviderId = await resolveProviderFromAuthenticatedIdentity();
      if (identityProviderId) {
        prescriberId = identityProviderId;
      }
    }

    if (!prescriberId) {
      return NextResponse.json(
        {
          error:
            'No provider profile is linked to this user. Link the user to a provider in Super Admin > Providers before using DoseSpot.',
        },
        { status: 404 }
      );
    }

    const patientId = parseInt(patientIdParam, 10);
    if (Number.isNaN(patientId) || patientId <= 0) {
      return NextResponse.json({ error: 'patientId must be a positive integer' }, { status: 400 });
    }

    const resolveSingleClinicProviderId = async (): Promise<number | null> => {
      const clinicProviders = await prisma.provider.findMany({
        where: clinicProviderScope,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2,
      });
      return clinicProviders.length === 1 ? clinicProviders[0]!.id : null;
    };

    const resolveRecentPatientOrderProviderId = async (): Promise<number | null> => {
      const recentOrder = await prisma.order.findFirst({
        where: {
          patientId,
          patient: { clinicId },
          provider: clinicProviderScope,
        },
        orderBy: { createdAt: 'desc' },
        select: { providerId: true },
      });
      return recentOrder?.providerId ?? null;
    };

    let result;
    try {
      result = await doseSpotSSOService.getPatientSSOUrl(patientId, prescriberId, clinicId, user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const providerNotFound = message.toLowerCase().includes('provider') && message.toLowerCase().includes('not found');
      if (providerNotFound && linkedProviderId && linkedProviderId !== prescriberId) {
        // If UI sends stale prescriberId, retry with provider linked to current user.
        result = await doseSpotSSOService.getPatientSSOUrl(
          patientId,
          linkedProviderId,
          clinicId,
          user.id
        );
      } else if (providerNotFound) {
        const identityProviderId = await resolveProviderFromAuthenticatedIdentity();
        if (identityProviderId && identityProviderId !== prescriberId) {
          result = await doseSpotSSOService.getPatientSSOUrl(
            patientId,
            identityProviderId,
            clinicId,
            user.id
          );
        } else {
          const recentPatientOrderProviderId = await resolveRecentPatientOrderProviderId();
          if (recentPatientOrderProviderId && recentPatientOrderProviderId !== prescriberId) {
            result = await doseSpotSSOService.getPatientSSOUrl(
              patientId,
              recentPatientOrderProviderId,
              clinicId,
              user.id
            );
          } else {
          const singleClinicProviderId = await resolveSingleClinicProviderId();
          if (singleClinicProviderId && singleClinicProviderId !== prescriberId) {
            result = await doseSpotSSOService.getPatientSSOUrl(
              patientId,
              singleClinicProviderId,
              clinicId,
              user.id
            );
          } else {
            return NextResponse.json(
              {
                error:
                  'Selected provider is invalid for this clinic. Link your user to the correct provider in Super Admin > Providers.',
              },
              { status: 404 }
            );
          }
          }
        }
      } else {
        throw error;
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('[DOSESPOT] SSO URL route failed', {
      clinicId: user.clinicId,
      userId: user.id,
      role: user.role,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleApiError(error, {
      context: { route: 'GET /api/dosespot/sso-url', clinicId: user.clinicId },
    });
  }
}

export const GET = withClinicalAuth(handler);
