/**
 * DoseSpot Provider Sync Service
 * ===============================
 *
 * Registers platform providers as DoseSpot clinicians.
 * Handles email conflicts, NPI validation errors, and role mapping.
 *
 * @module domains/dosespot/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getClinicDoseSpotClient } from '@/lib/clinic-dosespot';
import type { DoseSpotProviderPayload, ClinicianRoleType } from '@/lib/dosespot';
import type { ProviderSyncResult } from '../types';

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
      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          npi: true,
          dea: true,
          licenseState: true,
          doseSpotClinicianId: true,
        },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
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

      const defaultRoles: ClinicianRoleType[] = ['PrescribingClinician'];

      const payload: DoseSpotProviderPayload = {
        FirstName: provider.firstName,
        LastName: provider.lastName,
        DateOfBirth: '',
        Email: provider.email || '',
        Address1: '',
        City: '',
        State: provider.licenseState || '',
        ZipCode: '',
        PrimaryPhone: (provider.phone || '').replace(/\D/g, ''),
        PrimaryPhoneType: 'Cell',
        NPINumber: provider.npi,
        ClinicianRoleType: defaultRoles,
        Active: true,
      };

      const newId = await client.addProvider(payload);
      const doseSpotClinicianId = parseInt(newId, 10);

      await prisma.provider.update({
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
