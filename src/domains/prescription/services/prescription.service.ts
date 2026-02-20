/**
 * Prescription Service
 * ====================
 *
 * Business logic for prescription creation and submission to Lifefile pharmacy.
 * Extracted from the 1,070-line POST /api/prescriptions route handler.
 *
 * Responsibilities:
 *   - Provider authorization and clinic access verification
 *   - Patient upsert within atomic transaction
 *   - Order + Rx creation within atomic transaction
 *   - Lifefile API submission (post-transaction)
 *   - Invoice processing, refill queue, compensation, platform fees
 *
 * @module domains/prescription/services
 */

import { prisma, basePrisma, withRetry } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { MEDS, GLP1_PRODUCT_IDS, SYRINGE_KIT_PRODUCT_ID } from '@/lib/medications';
import { SHIPPING_METHODS } from '@/lib/shipping';
import { generatePrescriptionPDF } from '@/lib/pdf';
import { buildPatientSearchIndex } from '@/lib/utils/search';
import { markPrescribed } from '@/services/refill';
import { providerCompensationService } from '@/services/provider';
import { platformFeeService } from '@/services/billing';
import lifefile, { type LifefileOrderPayload, getEnvCredentials } from '@/lib/lifefile';
import { getClinicLifefileClient, getClinicLifefileCredentials } from '@/lib/clinic-lifefile';

import type { CreatePrescriptionInput, PrescriptionResult, UserContext } from '../types';

// ============================================================================
// Helpers
// ============================================================================

function getClinicalDifferenceStatement(medicationName: string): string | undefined {
  const upper = medicationName.toUpperCase();
  if (upper.includes('TIRZEPATIDE')) {
    return 'Beyond Medical Necessary - This individual patient would benefit from Tirzepatide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }
  if (upper.includes('SEMAGLUTIDE')) {
    return 'Beyond Medical Necessary - This individual patient would benefit from Semaglutide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }
  if (upper.includes('TESTOSTERONE')) {
    return 'Beyond medical necessary - This individual patient will benefit from Testosterone with grapeseed oil due to allergic reactions to commercially available one and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }
  return undefined;
}

function normalizeDob(input: string): string {
  if (!input) return '';
  if (input.includes('-')) return input;
  const parts = input.split('/');
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    if (yyyy && mm && dd) {
      return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return input;
}

function mapLifefileGender(gender: string): 'm' | 'f' | null {
  const g = (gender || '').toLowerCase().trim();
  if (g === 'm' || g === 'male') return 'm';
  if (g === 'f' || g === 'female') return 'f';
  return null;
}

// ============================================================================
// Service
// ============================================================================

export interface PrescriptionService {
  createPrescription(
    input: CreatePrescriptionInput,
    user: UserContext
  ): Promise<PrescriptionResult>;
}

export function createPrescriptionService(): PrescriptionService {
  return {
    async createPrescription(
      input: CreatePrescriptionInput,
      user: UserContext
    ): Promise<PrescriptionResult> {
      const providerId = input.providerId ?? user.providerId;
      if (!providerId) {
        throw new PrescriptionError('Provider selection required. Please select a provider before submitting.', 400);
      }

      // Look up provider
      const provider = await basePrisma.provider.findUnique({
        where: { id: providerId },
        include: { clinic: true },
      });
      if (!provider) {
        throw new PrescriptionError('Invalid providerId. Please ensure a provider profile is configured.', 400);
      }

      // Verify provider authorization
      if (user.role === 'provider') {
        const userData = await basePrisma.user.findUnique({
          where: { id: user.id },
          select: { providerId: true, email: true },
        });
        const canPrescribe =
          userData?.providerId === provider.id ||
          userData?.email?.toLowerCase() === provider.email?.toLowerCase();
        if (!canPrescribe) {
          logger.security('Provider attempted to prescribe as different provider', {
            userId: user.id,
            userProviderId: userData?.providerId,
            requestedProviderId: provider.id,
          });
          throw new PrescriptionError('Not authorized to prescribe as this provider', 403);
        }
      }

      // Resolve clinic
      const activeClinicId = input.clinicId || user.clinicId || provider.clinicId;
      if (!activeClinicId) {
        throw new PrescriptionError('Clinic context required to create prescription', 400);
      }

      // Verify provider-clinic access (skip for super_admin)
      if (user.role !== 'super_admin') {
        const hasAccess = await verifyProviderClinicAccess(provider, activeClinicId);
        if (!hasAccess) {
          throw new PrescriptionError('Provider is not authorized to prescribe for this clinic', 403);
        }
      }

      // Resolve Lifefile credentials
      const { client: lifefileClient, credentials: lifefileCredentials } =
        await resolveLifefileClient(activeClinicId);
      if (!lifefileCredentials) {
        throw new PrescriptionError('Lifefile not configured. Please contact your administrator.', 400);
      }

      // Save signature if needed
      if (input.signatureDataUrl && !provider.signatureDataUrl) {
        await prisma.provider.update({
          where: { id: providerId },
          data: { signatureDataUrl: input.signatureDataUrl },
        });
      }

      // Resolve medications
      const rxsWithMeds = input.rxs.map((rx) => {
        const med = MEDS[rx.medicationKey];
        if (!med) throw new PrescriptionError(`Invalid medicationKey: ${rx.medicationKey}`, 400);
        return { rx, med };
      });

      // Auto-add syringe kit (1 per vial) for GLP-1 medications (semaglutide/tirzepatide)
      const syringeKitMed = MEDS[String(SYRINGE_KIT_PRODUCT_ID)];
      if (syringeKitMed) {
        const glp1VialCount = rxsWithMeds
          .filter(({ med }) => GLP1_PRODUCT_IDS.has(med.id))
          .reduce((sum, { rx }) => sum + (Number(rx.quantity) || 1), 0);

        if (glp1VialCount > 0) {
          const alreadyHasSyringeKit = rxsWithMeds.some(
            ({ med }) => med.id === SYRINGE_KIT_PRODUCT_ID
          );
          if (!alreadyHasSyringeKit) {
            rxsWithMeds.push({
              rx: {
                medicationKey: String(SYRINGE_KIT_PRODUCT_ID),
                sig: 'Use supplies as directed for subcutaneous injection.',
                quantity: String(glp1VialCount),
                refills: '0',
                daysSupply: '30',
              },
              med: syringeKitMed,
            });
          }
        }
      }

      // Validate gender for Lifefile
      const lifefileGender = mapLifefileGender(input.patient.gender);
      if (!lifefileGender) {
        throw new PrescriptionError(
          'Pharmacy requires biological sex (Male or Female) for prescription processing.',
          400,
          'INVALID_PHARMACY_GENDER'
        );
      }

      // Build order payload
      const now = new Date();
      const messageId = `eonpro-${Date.now()}`;
      const referenceId = `rx-${Date.now()}`;
      const dateWritten = now.toISOString().slice(0, 10);
      const dobIso = normalizeDob(input.patient.dob);
      const primary = rxsWithMeds[0];

      // Generate PDF
      const pdfBase64 = await generatePrescriptionPDF({
        referenceId,
        date: now.toLocaleDateString(),
        clinic: {
          name: lifefileCredentials.practiceName || process.env.LIFEFILE_PRACTICE_NAME,
          address: lifefileCredentials.practiceAddress || process.env.LIFEFILE_PRACTICE_ADDRESS,
          phone: lifefileCredentials.practicePhone || process.env.LIFEFILE_PRACTICE_PHONE,
          fax: lifefileCredentials.practiceFax || process.env.LIFEFILE_PRACTICE_FAX,
        },
        provider: {
          name: `${provider.firstName} ${provider.lastName}`,
          npi: provider.npi,
          dea: provider.dea,
          licenseNumber: provider.licenseNumber,
          address1: lifefileCredentials.practiceAddress || process.env.LIFEFILE_PRACTICE_ADDRESS,
          phone: lifefileCredentials.practicePhone || process.env.LIFEFILE_PRACTICE_PHONE || provider.phone || undefined,
        },
        patient: {
          firstName: input.patient.firstName,
          lastName: input.patient.lastName,
          phone: input.patient.phone,
          email: input.patient.email,
          dob: dobIso,
          gender: input.patient.gender === 'm' ? 'Male' : input.patient.gender === 'f' ? 'Female' : 'Unknown',
          address1: input.patient.address1,
          address2: input.patient.address2,
          city: input.patient.city,
          state: input.patient.state,
          zip: input.patient.zip,
        },
        prescriptions: rxsWithMeds.map(({ rx, med }) => ({
          medication: med.name,
          strength: med.strength,
          sig: rx.sig,
          quantity: rx.quantity,
          refills: rx.refills,
          daysSupply: Number(rx.daysSupply) || 30,
        })),
        shipping: {
          methodLabel: SHIPPING_METHODS.find((m: any) => m.id === input.shippingMethod)?.label ?? `Service ${input.shippingMethod}`,
          addressLine1: input.patient.address1,
          addressLine2: input.patient.address2,
          city: input.patient.city,
          state: input.patient.state,
          zip: input.patient.zip,
        },
        signatureDataUrl: input.signatureDataUrl ?? provider.signatureDataUrl ?? null,
      });

      // Build Lifefile API payload
      const orderPayload: LifefileOrderPayload = {
        message: { id: messageId, sentTime: now.toISOString() },
        order: {
          general: { memo: 'EONPro ePrescribing Platform', referenceId },
          prescriber: {
            npi: provider.npi,
            licenseState: provider.licenseState ?? undefined,
            licenseNumber: provider.licenseNumber ?? undefined,
            dea: provider.dea ?? undefined,
            firstName: provider.firstName,
            lastName: provider.lastName,
            phone: provider.phone || lifefileCredentials.practicePhone || process.env.LIFEFILE_PRACTICE_PHONE || undefined,
            email: provider.email ?? undefined,
          },
          practice: {
            id: lifefileCredentials.practiceId || process.env.LIFEFILE_PRACTICE_ID,
            name: lifefileCredentials.practiceName || process.env.LIFEFILE_PRACTICE_NAME || 'APOLLO BASED HEALTH LLC',
          },
          patient: {
            firstName: input.patient.firstName,
            lastName: input.patient.lastName,
            dateOfBirth: dobIso,
            gender: lifefileGender,
            address1: input.patient.address1,
            address2: input.patient.address2,
            city: input.patient.city,
            state: input.patient.state,
            zip: input.patient.zip,
            phoneHome: input.patient.phone,
            email: input.patient.email,
          },
          shipping: {
            recipientType: 'patient',
            recipientFirstName: input.patient.firstName,
            recipientLastName: input.patient.lastName,
            recipientPhone: input.patient.phone,
            recipientEmail: input.patient.email ?? undefined,
            addressLine1: input.patient.address1,
            addressLine2: input.patient.address2,
            city: input.patient.city,
            state: input.patient.state,
            zipCode: input.patient.zip,
            service: input.shippingMethod,
          },
          billing: { payorType: 'pat' },
          rxs: rxsWithMeds.map(({ rx, med }) => ({
            rxType: 'new' as const,
            drugName: med.name,
            drugStrength: med.strength,
            drugForm: med.formLabel ?? med.form,
            lfProductID: med.id,
            quantity: rx.quantity,
            quantityUnits: 'EA',
            directions: rx.sig,
            refills: Number(rx.refills ?? '0'),
            dateWritten,
            daysSupply: Number(rx.daysSupply) || 30,
            clinicalDifferenceStatement: getClinicalDifferenceStatement(med.name),
          })),
          document: { pdfBase64 },
        },
      };

      // === ATOMIC TRANSACTION: Create order + patient + Rx items ===
      type TxResult = { order: Record<string, any>; patient: Record<string, any>; isNew: boolean };

      const txResult = await withRetry<TxResult>(
        () =>
          prisma.$transaction(async (tx: any) => {
            // Idempotency check
            const existing = await tx.order.findFirst({
              where: { messageId, clinicId: activeClinicId },
              include: { patient: true },
            });
            if (existing) return { order: existing, patient: existing.patient, isNew: false };

            // Resolve patient
            let patientRecord: any = null;
            let patientClinicId = activeClinicId;

            if (input.patientId) {
              patientRecord = await tx.patient.findUnique({ where: { id: input.patientId } });
              if (patientRecord) {
                patientClinicId = patientRecord.clinicId;
              }
            }

            if (!patientRecord) {
              patientRecord = await tx.patient.findFirst({
                where: {
                  firstName: input.patient.firstName,
                  lastName: input.patient.lastName,
                  dob: input.patient.dob,
                  clinicId: activeClinicId,
                },
              });
            }

            if (!patientRecord) {
              const searchIndex = buildPatientSearchIndex({
                firstName: input.patient.firstName,
                lastName: input.patient.lastName,
                email: input.patient.email,
                phone: input.patient.phone,
              });
              patientRecord = await tx.patient.create({
                data: {
                  firstName: input.patient.firstName,
                  lastName: input.patient.lastName,
                  dob: input.patient.dob,
                  gender: input.patient.gender,
                  phone: input.patient.phone,
                  email: input.patient.email,
                  address1: input.patient.address1,
                  address2: input.patient.address2 ?? null,
                  city: input.patient.city,
                  state: input.patient.state,
                  zip: input.patient.zip,
                  clinicId: activeClinicId,
                  searchIndex,
                },
              });
              patientClinicId = activeClinicId;
            }

            const orderStatus = input.queueForProvider ? 'queued_for_provider' : 'PENDING';
            const order = await tx.order.create({
              data: {
                messageId,
                referenceId,
                patientId: patientRecord.id,
                providerId,
                clinicId: patientClinicId,
                shippingMethod: input.shippingMethod,
                primaryMedName: primary.med.name,
                primaryMedStrength: primary.med.strength,
                primaryMedForm: primary.med.formLabel ?? primary.med.form,
                status: orderStatus,
                requestJson: JSON.stringify(orderPayload),
                ...(input.queueForProvider
                  ? { queuedForProviderAt: now, queuedByUserId: user.id }
                  : {}),
              },
            });

            await tx.rx.createMany({
              data: rxsWithMeds.map(({ rx, med }) => ({
                orderId: order.id,
                medicationKey: rx.medicationKey,
                medName: med.name,
                strength: med.strength,
                form: med.form,
                quantity: rx.quantity,
                refills: rx.refills,
                sig: rx.sig,
                daysSupply: Number(rx.daysSupply) || 30,
              })),
            });

            return { order, patient: patientRecord, isNew: true };
          }, { isolationLevel: 'Serializable' as any, timeout: 30000 }) as unknown as Promise<TxResult>,
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
          retryOn: (error: Error) => {
            const msg = error.message.toLowerCase();
            return msg.includes('connection') || msg.includes('timeout') || msg.includes('pool');
          },
        }
      );

      // Duplicate check
      if (!txResult.isNew) {
        return {
          success: true,
          order: txResult.order,
          duplicate: true,
          message: 'Duplicate submission - returning existing order',
        };
      }

      const { order, patient: patientRecord } = txResult;

      // Queued for provider — skip Lifefile
      if (input.queueForProvider) {
        return {
          success: true,
          order,
          patientId: patientRecord.id,
          queuedForProvider: true,
          message: 'Prescription queued for provider review.',
        };
      }

      // === EXTERNAL: Submit to Lifefile (post-transaction) ===
      let orderResponse: Record<string, any> | undefined;
      try {
        orderResponse = await lifefileClient.createFullOrder(orderPayload);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown Lifefile error';
        logger.error('[PrescriptionService] Lifefile submission failed', { orderId: order.id, error: msg });
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'error', errorMessage: `Lifefile submission failed: ${msg}` },
        });
        throw new PrescriptionError(`Failed to submit order to Lifefile: ${msg}`, 502);
      }

      const lifefileOrderId = orderResponse?.data?.orderId ?? orderResponse?.orderId ?? null;
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          lifefileOrderId: lifefileOrderId != null ? String(lifefileOrderId) : undefined,
          status: orderResponse?.status ?? 'sent',
          responseJson: JSON.stringify(orderResponse),
        },
      });

      // === POST-SUBMISSION SIDE EFFECTS (fire-and-forget, non-fatal) ===

      // Auto-mark invoice
      if (input.invoiceId) {
        await safeAsync(() =>
          prisma.invoice.update({
            where: { id: input.invoiceId },
            data: { prescriptionProcessed: true, prescriptionProcessedAt: new Date(), prescriptionProcessedBy: user.providerId ?? null },
          }),
          'invoice auto-mark'
        );
      }

      // Refill queue
      let refillResult: any = null;
      if (input.refillId) {
        refillResult = await safeAsync(
          () => markPrescribed(input.refillId!, providerId || user.id, order.id),
          'refill mark prescribed'
        );
      }

      // Provider compensation
      await safeAsync(
        () => providerCompensationService.recordPrescription(updated.id, providerId, {
          patientId: patientRecord.id,
          patientState: input.patient.state,
          medicationName: primary.med.name,
          invoiceId: input.invoiceId,
        }),
        'provider compensation'
      );

      // Platform fee
      await safeAsync(
        () => platformFeeService.recordPrescriptionFee(updated.id, providerId),
        'platform fee'
      );

      // Portal invite on first order
      await safeAsync(async () => {
        const orderCount = await prisma.order.count({ where: { patientId: patientRecord.id } });
        if (orderCount === 1) {
          const clinic = await prisma.clinic.findUnique({
            where: { id: patientRecord.clinicId },
            select: { settings: true },
          });
          const settings = (clinic?.settings as any)?.patientPortal;
          if (settings?.autoInviteOnFirstOrder) {
            const { createAndSendPortalInvite } = await import('@/lib/portal-invite/service');
            await createAndSendPortalInvite(patientRecord.id, 'first_order');
          }
        }
      }, 'portal invite');

      return {
        success: true,
        order: updated,
        lifefile: orderResponse,
        refill: refillResult
          ? { currentId: refillResult.current.id, nextId: refillResult.next?.id, nextRefillDate: refillResult.next?.nextRefillDate }
          : null,
      };
    },
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function verifyProviderClinicAccess(provider: any, clinicId: number): Promise<boolean> {
  // Check ProviderClinic junction table
  try {
    const assignment = await basePrisma.providerClinic.findFirst({
      where: { providerId: provider.id, clinicId, isActive: true },
      select: { id: true },
    });
    if (assignment) return true;
  } catch {
    // Table may not exist yet
  }

  // Legacy: direct clinic assignment or shared provider
  if (provider.clinicId === null || provider.clinicId === clinicId) return true;

  // Fallback: UserClinic for the provider's linked user
  const providerUser = await basePrisma.user.findFirst({
    where: { providerId: provider.id },
    include: { userClinics: { where: { clinicId, isActive: true } } },
  });
  return !!(providerUser?.userClinics && providerUser.userClinics.length > 0);
}

async function resolveLifefileClient(clinicId: number) {
  try {
    const credentials = await getClinicLifefileCredentials(clinicId);
    if (credentials) {
      const client = await getClinicLifefileClient(clinicId);
      return { client, credentials };
    }
  } catch (err: unknown) {
    logger.warn('[PrescriptionService] Clinic Lifefile credentials fallback', {
      clinicId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { client: lifefile, credentials: getEnvCredentials() };
}

async function safeAsync<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error(`[PrescriptionService] ${label} failed (non-fatal)`, {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return null;
  }
}

// ============================================================================
// Error
// ============================================================================

export class PrescriptionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'PrescriptionError';
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const prescriptionService = createPrescriptionService();
