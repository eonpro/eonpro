/**
 * DoseSpot Provider Sync Service
 * ===============================
 *
 * Registers platform providers as DoseSpot clinicians.
 * Handles email conflicts, NPI validation errors, and role mapping.
 *
 * Uses the provider's own date-of-birth and fax if set, and falls back to
 * the clinic's address / fax for the required practice-location fields.
 *
 * @module domains/dosespot/services
 */

import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getClinicDoseSpotClient } from '@/lib/clinic-dosespot';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domains/shared/errors/AppError';
import type { DoseSpotProviderPayload, ClinicianRoleType } from '@/lib/dosespot';
import type { ProviderSyncResult } from '../types';

interface ClinicAddress {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface DoseSpotProviderService {
  syncProvider(providerId: number, clinicId: number, userId: number): Promise<ProviderSyncResult>;
}

export function createDoseSpotProviderService(): DoseSpotProviderService {
  return {
    async syncProvider(
      providerId: number,
      clinicId: number,
      userId: number
    ): Promise<ProviderSyncResult> {
      const provider = await basePrisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          clinicId: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          email: true,
          phone: true,
          fax: true,
          npi: true,
          dea: true,
          licenseState: true,
          doseSpotClinicianId: true,
          providerClinics: {
            where: { clinicId, isActive: true },
            select: { id: true },
          },
          user: {
            select: {
              clinicId: true,
              userClinics: {
                where: { clinicId, isActive: true },
                select: { id: true },
              },
            },
          },
        },
      });

      if (!provider) {
        throw new NotFoundError('Provider', providerId);
      }

      const hasClinicAccess =
        provider.clinicId === clinicId ||
        provider.providerClinics.length > 0 ||
        provider.user?.clinicId === clinicId ||
        (provider.user?.userClinics?.length ?? 0) > 0;
      if (!hasClinicAccess) {
        throw new ForbiddenError(`Provider ${providerId} is not assigned to this clinic`);
      }

      if (!provider.npi || provider.npi.trim().length === 0) {
        throw new BadRequestError(
          `Provider is missing an NPI number. An NPI is required for DoseSpot e-prescribing.`
        );
      }

      if (!provider.firstName || !provider.lastName) {
        throw new BadRequestError(
          `Provider is missing first or last name. Both are required for DoseSpot registration.`
        );
      }

      const client = await getClinicDoseSpotClient(clinicId);

      if (provider.doseSpotClinicianId) {
        const roles = await client.getClinician(String(provider.doseSpotClinicianId));

        logger.info('[DOSESPOT] Provider already synced', {
          providerId,
          clinicId,
          doseSpotClinicianId: provider.doseSpotClinicianId,
          roles,
        });

        return {
          doseSpotClinicianId: provider.doseSpotClinicianId,
          action: 'already_synced',
          providerId,
          clinicId,
          roles,
        };
      }

      // Fetch clinic address and fax for practice-location defaults
      const clinic = await basePrisma.clinic.findUnique({
        where: { id: clinicId },
        select: {
          address: true,
          phone: true,
          lifefilePracticeFax: true,
        },
      });

      const clinicAddr = (clinic?.address as ClinicAddress | null) ?? {};

      // Validate all DoseSpot-required fields before calling the API
      const missing: string[] = [];
      if (!provider.dateOfBirth) missing.push('Date of Birth (set on provider profile)');
      const address1 = clinicAddr.address1 || '';
      if (!address1) missing.push('Address (set on clinic settings)');
      const city = clinicAddr.city || '';
      if (!city) missing.push('City (set on clinic settings)');
      const zip = clinicAddr.zip || '';
      if (!zip) missing.push('Zip Code (set on clinic settings)');
      const fax = provider.fax || clinic?.lifefilePracticeFax || '';
      if (!fax) missing.push('Fax (set on provider profile or clinic settings)');

      if (missing.length > 0) {
        throw new BadRequestError(
          `Cannot register provider with DoseSpot. Missing required fields: ${missing.join(', ')}`
        );
      }

      const dob = provider.dateOfBirth!;
      const dobStr = `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`;

      const defaultRoles: ClinicianRoleType[] = ['PrescribingClinician'];

      const payload: DoseSpotProviderPayload = {
        FirstName: provider.firstName,
        LastName: provider.lastName,
        DateOfBirth: dobStr,
        Email: provider.email || '',
        Address1: address1,
        City: city,
        State: provider.licenseState || clinicAddr.state || '',
        ZipCode: zip,
        PrimaryPhone: (provider.phone || clinic?.phone || '').replace(/\D/g, ''),
        PrimaryPhoneType: 'Cell',
        PrimaryFax: fax.replace(/\D/g, ''),
        NPINumber: provider.npi,
        ClinicianRoleType: defaultRoles,
        Active: true,
      };

      const newId = await client.addProvider(payload);
      const doseSpotClinicianId = parseInt(newId, 10);

      await basePrisma.provider.update({
        where: { id: providerId },
        data: { doseSpotClinicianId },
      });

      await auditLog(null, {
        eventType: AuditEventType.CONFIGURATION_CHANGE,
        userId,
        resourceType: 'Provider',
        resourceId: String(providerId),
        clinicId,
        action: 'DOSESPOT_PROVIDER_REGISTERED',
        outcome: 'SUCCESS',
        metadata: {
          externalSystem: 'DoseSpot',
          doseSpotClinicianId,
          roles: defaultRoles,
        },
      });

      logger.info('[DOSESPOT] Provider registered', {
        providerId,
        clinicId,
        doseSpotClinicianId,
      });

      return {
        doseSpotClinicianId,
        action: 'created',
        providerId,
        clinicId,
        roles: defaultRoles,
      };
    },
  };
}

export const doseSpotProviderService = createDoseSpotProviderService();
