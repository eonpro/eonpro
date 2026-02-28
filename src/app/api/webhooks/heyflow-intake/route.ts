import { NextRequest } from 'next/server';
import { PatientDocumentCategory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeMedLinkPayload } from '@/lib/medlink/intakeNormalizer';
import { upsertPatientFromIntake } from '@/lib/medlink/patientService';
import { generateIntakePdf } from '@/services/intakePdfService';
import { storeIntakePdf } from '@/services/storage/intakeStorage';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { attributeFromIntake, tagPatientWithReferralCodeOnly, attributeByRecentTouch } from '@/services/affiliate/attributionService';
import { extractPromoCode } from '@/lib/overtime/intakeNormalizer';
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
  const xHeyflowSecret = req.headers.get('x-heyflow-secret'); // Heyflow's header

  // Log authentication attempt
  logger.debug('[MEDLINK WEBHOOK] Auth check:', {
    hasXMedLinkSecret: !!xMedLinkSecret,
    hasAuthorization: !!authorization,
    hasXWebhookSecret: !!xWebhookSecret,
    hasXMedLinkSignature: !!xMedLinkSignature,
    hasXHeyflowSecret: !!xHeyflowSecret,
    configuredSecret: !!configuredSecret,
  });

  // Verify the webhook secret if configured
  if (configuredSecret) {
    const isValid =
      xMedLinkSecret === configuredSecret ||
      xWebhookSecret === configuredSecret ||
      xHeyflowSecret === configuredSecret || // Check Heyflow's header
      authorization === `Bearer ${configuredSecret}` ||
      authorization === configuredSecret;

    if (!isValid) {
      logger.warn('[MEDLINK WEBHOOK] Authentication warning - secret mismatch');
      logger.warn('[MEDLINK WEBHOOK] Expected secret:', {
        status: configuredSecret ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      });
      logger.warn('[MEDLINK WEBHOOK] Received headers:');
      logger.warn('  x-heyflow-secret:', {
        status: xHeyflowSecret ? '[PROVIDED]' : '[NOT PROVIDED]',
      });
      logger.warn('  x-medlink-secret:', {
        status: xMedLinkSecret ? '[PROVIDED]' : '[NOT PROVIDED]',
      });
      logger.warn('  x-webhook-secret:', {
        status: xWebhookSecret ? '[PROVIDED]' : '[NOT PROVIDED]',
      });
      // Continue processing but log the issue
    } else {
      logger.debug('[MEDLINK WEBHOOK] Authentication successful');
    }
  }

  const payload = await req.json();

  if (!payload) {
    logger.error('No payload received');
    return Response.json({ error: 'No payload' }, { status: 400 });
  }

  // Log raw payload for debugging - ENHANCED LOGGING
  logger.debug('[MEDLINK WEBHOOK] ============================================');
  logger.debug('[MEDLINK WEBHOOK] Raw payload received:');
  logger.debug('Data:', { json: JSON.stringify(payload, null, 2) });
  logger.debug('[MEDLINK WEBHOOK] Payload type:', { type: typeof payload });
  logger.debug('[MEDLINK WEBHOOK] Payload keys:', { keys: Object.keys(payload as any) });

  // Log specific data structures
  if (payload?.data) {
    logger.debug('[MEDLINK WEBHOOK] Data object found with keys:', {
      keys: Object.keys(payload.data),
    });
    logger.debug('[MEDLINK WEBHOOK] Data object sample:', {
      sample: JSON.stringify(payload.data, null, 2).slice(0, 500),
    });
  }
  if (payload?.answers) {
    logger.debug('[MEDLINK WEBHOOK] Answers array found', { count: payload.answers.length });
    logger.debug('[MEDLINK WEBHOOK] First 3 answers:', {
      answers: JSON.stringify(payload.answers.slice(0, 3), null, 2),
    });
  }
  if (payload?.sections) {
    logger.debug('[MEDLINK WEBHOOK] Sections found:', { count: payload.sections.length });
  }
  logger.debug('[MEDLINK WEBHOOK] ============================================');

  try {
    const normalized = normalizeMedLinkPayload(payload);
    logger.debug('[MEDLINK WEBHOOK] Normalized successfully:');
    logger.debug('  - Submission ID:', { id: normalized.submissionId });
    logger.debug('  - Sections:', { count: normalized.sections.length });
    logger.debug('  - Total answers:', { count: normalized.answers.length });

    // Log medical fields found
    const medicalKeywords = ['medical', 'health', 'medication', 'allerg', 'condition', 'symptom'];
    const medicalFields = normalized.answers.filter((a: any) =>
      medicalKeywords.some((k: any) => (a.label || '').toLowerCase().includes(k))
    );
    logger.debug('  - Medical fields found:', { value: medicalFields.length });
    if (medicalFields.length > 0) {
      logger.debug('  - Medical field samples:', {
        samples: medicalFields.slice(0, 3).map((f: any) => `${f.label}: ${f.value}`),
      });
    }

    // Store the normalized intake data for later display (including answers for vitals)
    const intakeDataToStore = {
      submissionId: normalized.submissionId,
      sections: normalized.sections,
      answers: normalized.answers,
      patient: normalized.patient,
      source: 'heyflow-intake',
      receivedAt: new Date().toISOString(),
    };

    // Upsert patient
    const patient = await upsertPatientFromIntake(normalized);

    // Extract and track promo/affiliate code
    const promoCode = extractPromoCode(payload);
    if (promoCode) {
      logger.debug(`[HEYFLOW WEBHOOK] Found promo code: ${promoCode}`);
      try {
        const patientRecord = await prisma.patient.findUnique({
          where: { id: patient.id },
          select: { clinicId: true },
        });
        if (patientRecord?.clinicId) {
          const result = await attributeFromIntake(
            patient.id,
            promoCode,
            patientRecord.clinicId,
            'heyflow'
          );
          if (result) {
            logger.debug(`[HEYFLOW WEBHOOK] Affiliate attribution created: ${result.refCode}`);
          } else {
            const tagged = await tagPatientWithReferralCodeOnly(patient.id, promoCode, patientRecord.clinicId);
            if (tagged) {
              logger.debug(`[HEYFLOW WEBHOOK] Profile tagged with referral code: ${promoCode}`);
            }
          }
        }
      } catch (trackError: any) {
        logger.warn(`[HEYFLOW WEBHOOK] Affiliate tracking failed: ${trackError.message}`);
      }
    } else {
      // No promo code found — try fallback attribution via referrer URL or recent touch
      try {
        const patientRecord = await prisma.patient.findUnique({
          where: { id: patient.id },
          select: { clinicId: true, attributionAffiliateId: true },
        });
        if (patientRecord?.clinicId && !patientRecord.attributionAffiliateId) {
          const referrerUrl = (payload['Referrer'] || payload['referrer'] || '') as string;
          const fallback = await attributeByRecentTouch(patient.id, referrerUrl || null, patientRecord.clinicId);
          if (fallback) {
            logger.info(`[HEYFLOW WEBHOOK] Fallback affiliate attribution: ${fallback.refCode}`);
          }
        }
      } catch (fallbackErr: any) {
        logger.warn(`[HEYFLOW WEBHOOK] Fallback attribution failed: ${fallbackErr.message}`);
      }
    }

    // Generate PDF
    const pdfContent = await generateIntakePdf(normalized, patient);

    // Store PDF in S3 and prepare filename
    const stored = await storeIntakePdf({
      patientId: patient.id,
      submissionId: normalized.submissionId,
      pdfBuffer: pdfContent,
      source: 'heyflow',
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
          source: 'heyflow',
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
      logger.debug('[HEYFLOW WEBHOOK] Generating SOAP note for patient:', { value: patient.id });
      const soapNote = await generateSOAPFromIntake(patient.id, patientDocument.id);
      soapNoteId = soapNote.id;
      logger.debug('[HEYFLOW WEBHOOK] SOAP note generated successfully:', { value: soapNoteId });
    } catch (error: any) {
      logger.error('[HEYFLOW WEBHOOK] Failed to generate SOAP note:', { error });
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
