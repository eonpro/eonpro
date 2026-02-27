/**
 * DoseSpot Patient Sync Service
 * ==============================
 *
 * Syncs platform patients to DoseSpot for e-prescribing.
 * Creates or updates patients in DoseSpot and stores the
 * DoseSpot patient ID on the platform Patient record.
 *
 * PHI is decrypted only at the moment of sync, never logged.
 *
 * @module domains/dosespot/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getClinicDoseSpotClient } from '@/lib/clinic-dosespot';
import type { DoseSpotPatientPayload } from '@/lib/dosespot';
import type { PatientSyncResult } from '../types';
import { mapGender, mapPhoneType } from '../types';

export interface DoseSpotPatientService {
  syncPatient(patientId: number, clinicId: number, userId: number): Promise<PatientSyncResult>;
}

export function createDoseSpotPatientService(): DoseSpotPatientService {
  return {
    async syncPatient(
      patientId: number,
      clinicId: number,
      userId: number
    ): Promise<PatientSyncResult> {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          clinicId: true,
          firstName: true,
          lastName: true,
          dob: true,
          gender: true,
          email: true,
          phone: true,
          address1: true,
          city: true,
          state: true,
          zip: true,
          doseSpotPatientId: true,
        },
      });

      if (!patient) {
        throw new Error(`Patient ${patientId} not found`);
      }

      if (patient.clinicId !== clinicId) {
        throw new Error('Cross-clinic patient sync not allowed');
      }

      const client = await getClinicDoseSpotClient(clinicId);

      const firstName = await decryptPHI(patient.firstName);
      const lastName = await decryptPHI(patient.lastName);
      const dob = await decryptPHI(patient.dob);
      const email = await decryptPHI(patient.email);
      const phone = await decryptPHI(patient.phone);
      const address1 = await decryptPHI(patient.address1);
      const city = await decryptPHI(patient.city);
      const state = await decryptPHI(patient.state);
      const zip = await decryptPHI(patient.zip);

      const payload: DoseSpotPatientPayload = {
        FirstName: firstName || '',
        LastName: lastName || '',
        DateOfBirth: dob || '',
        Gender: mapGender(patient.gender || ''),
        Email: email || '',
        Address1: address1 || '',
        City: city || '',
        State: state || '',
        ZipCode: zip || '',
        PrimaryPhone: (phone || '').replace(/\D/g, ''),
        PrimaryPhoneType: mapPhoneType(phone || ''),
        Active: true,
      };

      let action: PatientSyncResult['action'];
      let doseSpotPatientId: number;

      if (patient.doseSpotPatientId) {
        await client.updatePatient(String(patient.doseSpotPatientId), payload);
        doseSpotPatientId = patient.doseSpotPatientId;
        action = 'updated';
      } else {
        const newId = await client.addPatient(payload);
        doseSpotPatientId = parseInt(newId, 10);
        action = 'created';

        await prisma.patient.update({
          where: { id: patientId },
          data: { doseSpotPatientId },
        });
      }

      await auditLog(null, {
        eventType: action === 'created' ? AuditEventType.PHI_CREATE : AuditEventType.PHI_UPDATE,
        userId,
        resourceType: 'Patient',
        resourceId: String(patientId),
        clinicId,
        action: `DOSESPOT_PATIENT_SYNC_${action.toUpperCase()}`,
        outcome: 'SUCCESS',
        metadata: {
          externalSystem: 'DoseSpot',
          doseSpotPatientId,
          syncAction: action,
        },
      });

      logger.info('[DOSESPOT] Patient synced', {
        patientId,
        clinicId,
        doseSpotPatientId,
        action,
      });

      return { doseSpotPatientId, action, patientId, clinicId };
    },
  };
}

export const doseSpotPatientService = createDoseSpotPatientService();
