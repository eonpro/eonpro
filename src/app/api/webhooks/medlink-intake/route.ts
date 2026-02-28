import { NextRequest } from 'next/server';
import { PatientDocumentCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeMedLinkPayload } from '@/lib/medlink/intakeNormalizer';
import { upsertPatientFromIntake } from '@/lib/medlink/patientService';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { attributeFromIntakeExtended, tagPatientWithReferralCodeOnly } from '@/services/affiliate/attributionService';
import { logger } from '@/lib/logger';
import { storeIntakeData } from '@/lib/storage/document-data-store';

export async function POST(req: NextRequest) {
  // Log all incoming headers for debugging
  logger.debug('[MEDLINK WEBHOOK] Incoming request headers:');
  req.headers.forEach((value, key) => {
    logger.debug(
      `  ${key}: ${key.toLowerCase().includes('secret') || key.toLowerCase().includes('auth') ? '[REDACTED]' : value}`
    );
  });

  const configuredSecret = process.env.MEDLINK_WEBHOOK_SECRET;
  if (!configuredSecret) {
    logger.warn('[MEDLINK WEBHOOK] No secret configured, accepting all requests');
  }

  // Check multiple possible authentication methods
  const xMedLinkSecret = req.headers.get('x-medlink-secret');
  const authorization = req.headers.get('authorization');
  const xWebhookSecret = req.headers.get('x-webhook-secret');
  const xMedLinkSignature = req.headers.get('x-medlink-signature');

  // Log authentication attempt
  logger.debug('[MEDLINK WEBHOOK] Auth check:', {
    hasXMedLinkSecret: !!xMedLinkSecret,
    hasAuthorization: !!authorization,
    hasXWebhookSecret: !!xWebhookSecret,
    hasXMedLinkSignature: !!xMedLinkSignature,
    configuredSecret: !!configuredSecret,
  });

  // Verify the webhook secret if configured
  if (configuredSecret) {
    const isValid =
      xMedLinkSecret === configuredSecret ||
      xWebhookSecret === configuredSecret ||
      authorization === `Bearer ${configuredSecret}` ||
      authorization === configuredSecret;

    if (!isValid) {
      logger.warn('[MEDLINK WEBHOOK] Authentication failed');
      // For now, just log but don't reject to help debug
    }
  }

  const payload = await req.json();

  if (!payload) {
    logger.error('No payload received');
    return Response.json({ error: 'No payload' }, { status: 400 });
  }

  // Log raw payload for debugging
  logger.debug('[MEDLINK WEBHOOK] Raw payload received:');
  logger.debug('Data:', { json: JSON.stringify(payload, null, 2) });
  logger.debug('[MEDLINK WEBHOOK] Payload type:', { type: typeof payload });
  logger.debug('[MEDLINK WEBHOOK] Payload keys:', { keys: Object.keys(payload as any) });

  try {
    const normalized = normalizeMedLinkPayload(payload);
    logger.debug('[MEDLINK WEBHOOK] Normalized successfully:');
    logger.debug('  - Submission ID:', { value: normalized.submissionId });
    logger.debug('  - Sections:', { count: normalized.sections.length });

    // Store the normalized intake data for later display (including answers for vitals)
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      patient: normalized.patient,
      source: 'medlink-intake',
      receivedAt: new Date().toISOString(),
    };

    // Upsert patient
    const patient = await upsertPatientFromIntake(normalized);

    // Process referral tracking for affiliate promo codes
    const promoCodeEntry = normalized.answers?.find(
      (entry) =>
        entry.label?.toLowerCase().includes('promo') ||
        entry.label?.toLowerCase().includes('referral') ||
        entry.label?.toLowerCase().includes('discount') ||
        entry.id === 'promo_code' ||
        entry.id === 'referral_code'
    );

    if (promoCodeEntry?.value) {
      const promoCode = promoCodeEntry.value.trim().toUpperCase();

      logger.debug(`[MEDLINK WEBHOOK] Found promo code: ${promoCode} for patient ${patient.id}`);

      try {
        // Fetch clinicId from the patient record
        const patientRecord = await prisma.patient.findUnique({
          where: { id: patient.id },
          select: { clinicId: true },
        });
        const patientClinicId = patientRecord?.clinicId;

        if (patientClinicId) {
          const result = await attributeFromIntakeExtended(patient.id, promoCode, patientClinicId, 'medlink-intake');
          if (result.success) {
            logger.info(`[MEDLINK WEBHOOK] ✓ Affiliate attribution: ${promoCode} -> affiliateId=${result.affiliateId}`);
          } else {
            const tagged = await tagPatientWithReferralCodeOnly(patient.id, promoCode, patientClinicId);
            if (tagged) {
              logger.info(`[MEDLINK WEBHOOK] ✓ Profile tagged with referral code (no affiliate yet): ${promoCode}`);
            }
          }
        } else {
          logger.warn(`[MEDLINK WEBHOOK] No clinicId found for patient ${patient.id}, skipping affiliate tracking`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`[MEDLINK WEBHOOK] Affiliate tracking failed:`, { error: errMsg, promoCode });
      }
    }

    // Generate PDF
    const pdfContent = await generateIntakePdf(normalized, patient);

    // Store PDF in S3 and prepare filename
    const stored = await storeIntakePdf({
      patientId: patient.id,
      submissionId: normalized.submissionId,
      pdfBuffer: pdfContent,
      source: 'medlink',
    });

    // Check if this intake document already exists
    const existingDocument = await prisma.patientDocument.findUnique({
      where: { sourceSubmissionId: normalized.submissionId },
      select: { id: true, externalUrl: true },
    });

    // Dual-write: S3 + DB `data` column (Phase 3.3)
    const { s3DataKey, dataBuffer: intakeDataBuffer } = await storeIntakeData(
      intakeDataToStore,
      { documentId: existingDocument?.id, patientId: patient.id, clinicId: null }
    );

    let patientDocument;
    if (existingDocument) {
      patientDocument = await prisma.patientDocument.update({
        where: { id: existingDocument.id },
        data: {
          filename: stored.filename,
          data: new Uint8Array(intakeDataBuffer),
          ...(s3DataKey != null ? { s3DataKey } : {}),
          externalUrl: stored.s3Key || existingDocument.externalUrl,
        },
      });
    } else {
      patientDocument = await prisma.patientDocument.create({
        data: {
          patientId: patient.id,
          filename: stored.filename,
          mimeType: 'application/pdf',
          source: 'medlink',
          sourceSubmissionId: normalized.submissionId,
          category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
          data: new Uint8Array(intakeDataBuffer),
          ...(s3DataKey != null ? { s3DataKey } : {}),
          externalUrl: stored.s3Key,
        },
      });
    }

    // Generate SOAP note from the intake asynchronously
    let soapNoteId = null;
    try {
      logger.debug('[MEDLINK WEBHOOK] Generating SOAP note for patient:', { value: patient.id });
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.debug('[MEDLINK WEBHOOK] SOAP note generated successfully:', { value: soapNoteId });
    } catch (error: any) {
      // @ts-ignore

      logger.error('[MEDLINK WEBHOOK] Failed to generate SOAP note:', { error });
      // Don't fail the webhook if SOAP generation fails
    }

    return Response.json(
      {
        ok: true,
        patientId: patient.id,
        documentId: patientDocument.id,
        soapNoteId,
        pdfSizeBytes: stored.pdfBuffer.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    // @ts-ignore

    logger.error('Failed to process MedLink webhook', { error: err });
    return Response.json({ error: 'Failed to process intake' }, { status: 500 });
  }
}
