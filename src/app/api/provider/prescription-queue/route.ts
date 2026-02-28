/**
 * Prescription Queue API
 * Manages the prescription processing queue for providers
 *
 * GET  - List patients with paid invoices AND approved refills that need prescription processing
 * PATCH - Mark a prescription as processed
 *
 * CRITICAL: Each item includes SOAP note status for clinical documentation compliance
 *
 * Queue sources:
 * 1. Paid invoices (prescriptionProcessed = false) - original queue
 * 2. Approved refills (status = APPROVED or PENDING_PROVIDER) - refill queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import { handleApiError } from '@/domains/shared/errors';
// Circuit breaker removed from this endpoint — it must stay consistent with the /count
// endpoint (which uses raw Prisma). The circuit breaker was causing the data query to fail
// while the count succeeded, resulting in a misleading "All caught up!" empty state.
import type {
  Invoice,
  Clinic,
  Patient,
  IntakeFormSubmission,
  SOAPNote,
  RefillQueue,
  Subscription,
} from '@prisma/client';

// Vercel serverless: allow up to 60s for this heavy query endpoint
export const maxDuration = 60;

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    // Check if it looks encrypted (3 base64 parts with colons)
    // Min length reduced to 2 to handle short encrypted values like state codes
    const parts = value.split(':');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value);
    }
    return value; // Not encrypted, return as-is
  } catch (e) {
    logger.warn('[PRESCRIPTION-QUEUE] Failed to decrypt patient field', {
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return null; // Return null instead of encrypted blob
  }
};

// Type for PatientDocument metadata (blob data loaded lazily via separate endpoint)
type PatientDocumentWithData = {
  id: number;
  data?: Buffer | null;
  sourceSubmissionId: string | null;
  category: string;
};

// Type for invoice with included relations from our query
type InvoiceWithRelations = Invoice & {
  clinic: Pick<
    Clinic,
    'id' | 'name' | 'subdomain' | 'lifefileEnabled' | 'lifefilePracticeName'
  > | null;
  patient: Pick<
    Patient,
    'id' | 'patientId' | 'firstName' | 'lastName' | 'email' | 'phone' | 'dob' | 'clinicId'
  > & {
    intakeSubmissions: Pick<IntakeFormSubmission, 'id' | 'completedAt'>[];
    soapNotes: Pick<SOAPNote, 'id' | 'status' | 'createdAt' | 'approvedAt' | 'approvedBy'>[];
  };
};

// Type for refill queue with included relations
type RefillWithRelations = RefillQueue & {
  clinic: Pick<
    Clinic,
    'id' | 'name' | 'subdomain' | 'lifefileEnabled' | 'lifefilePracticeName'
  > | null;
  patient: Pick<
    Patient,
    'id' | 'patientId' | 'firstName' | 'lastName' | 'email' | 'phone' | 'dob' | 'clinicId'
  > & {
    intakeSubmissions: Pick<IntakeFormSubmission, 'id' | 'completedAt'>[];
    soapNotes: Pick<SOAPNote, 'id' | 'status' | 'createdAt' | 'approvedAt' | 'approvedBy'>[];
  };
  subscription: Pick<Subscription, 'id' | 'planName' | 'status'> | null;
};

/**
 * GET /api/provider/prescription-queue
 * Get list of patients in the prescription processing queue
 *
 * Query params:
 * - limit: number of records (default 50)
 * - offset: pagination offset (default 0)
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '500', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    logger.info('[PRESCRIPTION-QUEUE] GET request', {
      userId: user.id,
      userEmail: user.email,
      providerId: user.providerId,
      clinicId: user.clinicId,
    });

    // Use the current session's clinic context — providers must only see
    // prescriptions for the clinic they are currently logged into.
    // Previously this used getClinicIdsForProviderUser() across ALL clinics,
    // which leaked cross-clinic data when providers had multiple clinic associations.
    if (!user.clinicId) {
      logger.warn('[PRESCRIPTION-QUEUE] No clinic context in session', { userId: user.id });
      return NextResponse.json(
        { error: 'No clinic context. Please log in again.' },
        { status: 400 }
      );
    }
    const clinicIds = [user.clinicId];

    // Query paid invoices that haven't been processed yet (across all provider's clinics)
    // CRITICAL: Include clinic info for Lifefile prescription context
    // NOTE: We don't require IntakeFormSubmission because:
    // - WellMedR/Heyflow patients have intake data in invoice metadata, not IntakeFormSubmission
    // - EONmeds patients use internal intake forms (IntakeFormSubmission)
    // The prescription process handles both scenarios
    // Also fetch orders queued by admin for provider approval (status = queued_for_provider)
    //
    // IMPORTANT: Exclude patients with PENDING_COMPLETION profileStatus.
    // These are auto-created from Stripe payments and need admin profile completion
    // before they can be prescribed. They are visible in /api/finance/pending-profiles.
    // Load data and counts in parallel (no circuit breaker — this is a critical provider view
    // and must stay consistent with the /count endpoint which also uses raw Prisma)

    const [invoices, refills, queuedOrders, invoiceCount, refillCount, queuedOrderCount] =
      await Promise.all([
        prisma.invoice.findMany({
          where: {
            clinicId: { in: clinicIds },
            status: 'PAID',
            prescriptionProcessed: false,
            patient: {
              profileStatus: { not: 'PENDING_COMPLETION' },
            },
          },
          include: {
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
                lifefileEnabled: true,
                lifefilePracticeName: true,
              },
            },
            patient: {
              select: {
                id: true,
                patientId: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                dob: true,
                clinicId: true,
                intakeSubmissions: {
                  where: { status: 'completed' },
                  orderBy: { completedAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    completedAt: true,
                  },
                },
                soapNotes: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    approvedAt: true,
                    approvedBy: true,
                  },
                },
              },
            },
          },
          orderBy: {
            paidAt: 'asc',
          },
          take: limit,
          skip: offset,
        }),
        prisma.refillQueue.findMany({
          where: {
            clinicId: { in: clinicIds },
            status: { in: ['APPROVED', 'PENDING_PROVIDER', 'ON_HOLD'] },
          },
          include: {
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
                lifefileEnabled: true,
                lifefilePracticeName: true,
              },
            },
            patient: {
              select: {
                id: true,
                patientId: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                dob: true,
                clinicId: true,
                intakeSubmissions: {
                  where: { status: 'completed' },
                  orderBy: { completedAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    completedAt: true,
                  },
                },
                soapNotes: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    approvedAt: true,
                    approvedBy: true,
                  },
                },
              },
            },
            subscription: {
              select: {
                id: true,
                planName: true,
                status: true,
              },
            },
          },
          orderBy: {
            providerQueuedAt: 'asc',
          },
          take: limit,
          skip: offset,
        }),
        prisma.order.findMany({
          where: {
            clinicId: { in: clinicIds },
            status: { in: ['queued_for_provider', 'needs_info'] },
          },
          include: {
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
                lifefileEnabled: true,
                lifefilePracticeName: true,
              },
            },
            patient: {
              select: {
                id: true,
                patientId: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                dob: true,
                clinicId: true,
                soapNotes: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    status: true,
                    createdAt: true,
                    approvedAt: true,
                    approvedBy: true,
                  },
                },
              },
            },
            provider: { select: { id: true, firstName: true, lastName: true, email: true } },
            rxs: true,
          },
          orderBy: { queuedForProviderAt: 'asc' },
          take: limit,
          skip: offset,
        }),
        prisma.invoice.count({
          where: {
            clinicId: { in: clinicIds },
            status: 'PAID',
            prescriptionProcessed: false,
            patient: {
              profileStatus: { not: 'PENDING_COMPLETION' },
            },
          },
        }),
        prisma.refillQueue.count({
          where: {
            clinicId: { in: clinicIds },
            status: { in: ['APPROVED', 'PENDING_PROVIDER', 'ON_HOLD'] },
          },
        }),
        prisma.order.count({
          where: {
            clinicId: { in: clinicIds },
            status: { in: ['queued_for_provider', 'needs_info'] },
          },
        }),
      ]);

    // Fetch hold status via raw SQL (columns may not exist if migration not applied)
    const invoiceIds = (invoices as any[]).map((i: any) => i.id);
    let invoiceHoldMap = new Map<number, { reason: string; heldAt: string }>();
    if (invoiceIds.length > 0) {
      try {
        const holdRows: any[] = await prisma.$queryRawUnsafe(
          `SELECT id, "prescriptionHoldReason", "prescriptionHeldAt" FROM "Invoice" WHERE id = ANY($1::int[]) AND "prescriptionHoldReason" IS NOT NULL`,
          invoiceIds
        );
        for (const row of holdRows) {
          invoiceHoldMap.set(row.id, {
            reason: row.prescriptionHoldReason,
            heldAt: row.prescriptionHeldAt?.toISOString?.() || String(row.prescriptionHeldAt),
          });
        }
      } catch {
        // Hold columns don't exist yet - that's fine, hold feature disabled until migration
      }
    }

    // Fetch refill hold reasons via raw SQL
    const refillIds = (refills as any[]).filter((r: any) => r.status === 'ON_HOLD').map((r: any) => r.id);
    let refillHoldMap = new Map<number, string>();
    if (refillIds.length > 0) {
      try {
        const holdRows: any[] = await prisma.$queryRawUnsafe(
          `SELECT id, "providerHoldReason" FROM "RefillQueue" WHERE id = ANY($1::int[]) AND "providerHoldReason" IS NOT NULL`,
          refillIds
        );
        for (const row of holdRows) {
          refillHoldMap.set(row.id, row.providerHoldReason);
        }
      } catch {
        // providerHoldReason column doesn't exist yet
      }
    }

    const totalCount = invoiceCount + refillCount + queuedOrderCount;

    // Helper function to normalize keys for comparison (lowercase, remove spaces/dashes/underscores)
    const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_\s]/g, '');

    // Check if product/treatment looks like plan-only (e.g. "1mo Injections", "3mo Injections", "1 month", "3 month")
    // without a medication name like tirzepatide or semaglutide.
    // Lenient: handles suffixes like "1mo Injections WM-202602-0151" (invoice numbers, etc.)
    const looksLikePlanOnly = (text: string): boolean => {
      if (!text || typeof text !== 'string') return false;
      const lower = text.toLowerCase().trim().replace(/\s+/g, ' ');
      // Has explicit medication name - not plan-only
      if (
        lower.includes('tirzepatide') ||
        lower.includes('semaglutide') ||
        lower.includes('mounjaro') ||
        lower.includes('zepbound') ||
        lower.includes('ozempic') ||
        lower.includes('wegovy')
      ) {
        return false;
      }
      // Plan-like: contains "injection" or "Xmo"/"X month" but NO medication name
      const hasInjection = /\binjections?\b/i.test(lower);
      const hasPlanDuration = /\b(\d+\s*mo|\d+\s*month|1mo|2mo|3mo|6mo|1\s*month|3\s*month|6\s*month)\b/i.test(lower);
      return hasInjection || hasPlanDuration;
    };

    // ─── WellMedR price-to-medication mapping ───
    // WellMedR has fixed pricing per medication+plan. The price on the invoice
    // deterministically identifies the medication when Airtable sends plan-only product.
    // Prices in cents. Uses plan duration + price threshold to distinguish Sema vs Tirz.
    // At every plan level, Tirzepatide is ~1.5-1.7x Semaglutide price.
    const deriveWellmedrMedicationFromPrice = (amountCents: number, planMonths: number): string | null => {
      if (!amountCents || amountCents <= 0) return null;
      const dollars = amountCents / 100;
      // Thresholds: midpoint between Semaglutide and Tirzepatide prices at each plan level
      // 1mo: Sema=$149, Tirz=$249 → threshold $199
      // 3mo: Sema=$485, Tirz=$677 → threshold $581
      // 6mo: Sema=$820, Tirz=$1234 → threshold $1027
      // 12mo: Sema=$1290, Tirz=$2130 → threshold $1710
      switch (planMonths) {
        case 1:
          return dollars < 199 ? 'Semaglutide' : 'Tirzepatide';
        case 3:
          return dollars < 581 ? 'Semaglutide' : 'Tirzepatide';
        case 6:
          return dollars < 1027 ? 'Semaglutide' : 'Tirzepatide';
        case 12:
          return dollars < 1710 ? 'Semaglutide' : 'Tirzepatide';
        default:
          // Unknown plan — try to match known exact prices (with 10% tolerance)
          const knownPrices: Array<{ price: number; med: string }> = [
            { price: 149, med: 'Semaglutide' },
            { price: 249, med: 'Tirzepatide' },
            { price: 485, med: 'Semaglutide' },
            { price: 677, med: 'Tirzepatide' },
            { price: 820, med: 'Semaglutide' },
            { price: 1234, med: 'Tirzepatide' },
            { price: 1290, med: 'Semaglutide' },
            { price: 2130, med: 'Tirzepatide' },
          ];
          for (const kp of knownPrices) {
            if (Math.abs(dollars - kp.price) / kp.price < 0.10) {
              return kp.med;
            }
          }
          return null;
      }
    };

    // Extract preferred medication from intake document for fallback when invoice metadata has plan-only
    const extractMedicationFromDocument = (documentData: Buffer | Uint8Array | null): string | null => {
      if (!documentData) return null;
      try {
        let rawData: string;
        if (Buffer.isBuffer(documentData)) {
          rawData = documentData.toString('utf8');
        } else if (documentData instanceof Uint8Array) {
          rawData = new TextDecoder().decode(documentData);
        } else if (
          typeof documentData === 'object' &&
          (documentData as any).type === 'Buffer' &&
          Array.isArray((documentData as any).data)
        ) {
          rawData = new TextDecoder().decode(new Uint8Array((documentData as any).data));
        } else {
          rawData = String(documentData);
        }
        const docJson = JSON.parse(rawData);
        const check = (obj: Record<string, unknown>, keys: string[]): string | null => {
          for (const k of keys) {
            const v = obj[k];
            if (v && typeof v === 'string' && v.trim()) {
              const s = v.trim();
              if (
                /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(s) &&
                s.toLowerCase() !== 'none'
              ) {
                return s;
              }
            }
          }
          return null;
        };
        // Root-level fields (Airtable/WellMedR format)
        const fromRoot = check(docJson, [
          'preferred-meds',
          'preferredMedication',
          'preferred_meds',
          'medication-preference',
          'medication_type',
          'medicationType',
          'glp1-medication-type',
          'glp1_last_30_medication_type',
          'glp1-last-30-medication-type',
          'product',
          'treatment',
        ]);
        if (fromRoot) return fromRoot;
        // answers array
        if (docJson.answers && Array.isArray(docJson.answers)) {
          for (const a of docJson.answers) {
            const key = normalizeKey(
              String(a.question || a.field || a.id || a.label || '').toLowerCase()
            );
            const val = a.answer ?? a.value;
            if (typeof val !== 'string' || !val.trim()) continue;
            if (
              key.includes('preferred') ||
              key.includes('medication') ||
              key.includes('glp1type') ||
              key.includes('treatment')
            ) {
              if (
                /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(val) &&
                val.toLowerCase() !== 'none'
              ) {
                return val.trim();
              }
            }
          }
        }
        // sections
        if (docJson.sections && Array.isArray(docJson.sections)) {
          for (const sec of docJson.sections) {
            const entries = sec.questions || sec.entries || sec.fields || [];
            if (!Array.isArray(entries)) continue;
            for (const q of entries) {
              const key = normalizeKey(String(q.question || q.field || q.id || q.label || ''));
              const val = q.answer ?? q.value;
              if (typeof val !== 'string' || !val.trim()) continue;
              if (
                key.includes('preferred') ||
                key.includes('medication') ||
                key.includes('glp1type')
              ) {
                if (
                  /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(val) &&
                  val.toLowerCase() !== 'none'
                ) {
                  return val.trim();
                }
              }
            }
          }
        }
      } catch {
        // ignore parse errors
      }
      return null;
    };

    // Helper function to extract GLP-1 info from metadata and/or document data
    const extractGlp1Info = (
      metadata: Record<string, unknown> | null,
      documentData: Buffer | Uint8Array | null,
      patientName?: string
    ) => {
      // Helper to check for exact Airtable field names (with dashes)
      // These are the exact field names from Airtable intake forms
      const checkExactAirtableFields = (obj: Record<string, unknown>) => {
        // Check exact Airtable field names (case-insensitive)
        const glp1Last30 = obj['glp1-last-30'] || obj['glp1_last_30'] || obj['GLP1-last-30'];
        const glp1Type =
          obj['glp1-last-30-medication-type'] ||
          obj['glp1_last_30_medication_type'] ||
          obj['GLP1-last-30-medication-type'];
        const glp1Dose =
          obj['glp1-last-30-medication-dose-mg'] ||
          obj['glp1_last_30_medication_dose_mg'] ||
          obj['GLP1-last-30-medication-dose-mg'];

        if (glp1Last30) {
          const isYes = String(glp1Last30).toLowerCase() === 'yes' || glp1Last30 === true;
          if (isYes) {
            return {
              usedGlp1: true,
              glp1Type: glp1Type ? String(glp1Type) : null,
              lastDose: glp1Dose ? String(glp1Dose).replace(/[^\d.]/g, '') : null,
            };
          }
        }
        return null;
      };

      // First try to get GLP-1 info from PatientDocument (intake form data)
      if (documentData) {
        try {
          // Handle various buffer/array formats (Prisma 6.x returns Bytes as Uint8Array)
          let rawData: string;
          if (Buffer.isBuffer(documentData)) {
            rawData = documentData.toString('utf8');
          } else if (documentData instanceof Uint8Array) {
            rawData = new TextDecoder().decode(documentData);
          } else if (
            typeof documentData === 'object' &&
            (documentData as any).type === 'Buffer' &&
            Array.isArray((documentData as any).data)
          ) {
            rawData = new TextDecoder().decode(new Uint8Array((documentData as any).data));
          } else {
            rawData = String(documentData);
          }

          const docJson = JSON.parse(rawData);

          // FIRST: Check for exact Airtable field names at root level
          const exactMatch = checkExactAirtableFields(docJson);
          if (exactMatch) {
            return exactMatch;
          }

          // SECOND: Check for glp1History structure (WellMedR intake format)
          if (docJson.glp1History) {
            const history = docJson.glp1History;
            const usedLast30 = history.usedLast30Days;
            const medType = history.medicationType;
            const doseMg = history.doseMg;

            if (usedLast30 && (String(usedLast30).toLowerCase() === 'yes' || usedLast30 === true)) {
              return {
                usedGlp1: true,
                glp1Type: medType || null,
                lastDose: doseMg ? String(doseMg) : null,
              };
            }
          }

          // THIRD: Check the answers array for GLP-1 fields
          // MedLink uses id/label, other sources use question/field
          if (docJson.answers && Array.isArray(docJson.answers)) {
            let usedGlp1 = false;
            let glp1Type: string | null = null;
            let lastDose: string | null = null;

            for (const answer of docJson.answers) {
              // Support multiple field naming conventions: MedLink (id/label), WellMedR (question/field)
              const key = normalizeKey(
                answer.question || answer.field || answer.id || answer.label || ''
              );
              const val = answer.answer || answer.value || '';

              // GLP-1 usage patterns - matches "Used GLP-1 in Last 30 Days", "glp1-last-30", etc.
              if (
                key.includes('glp1last30') ||
                key.includes('usedglp1') ||
                key.includes('glp1inlast30')
              ) {
                if (String(val).toLowerCase() === 'yes' || val === true) {
                  usedGlp1 = true;
                }
              }
              // GLP-1 type patterns - matches "Recent GLP-1 Medication Type", "glp1Type", etc.
              if (
                key.includes('glp1type') ||
                key.includes('medicationtype') ||
                key.includes('recentglp1') ||
                key.includes('currentglp1') ||
                key.includes('glp1medication')
              ) {
                if (
                  val &&
                  String(val).toLowerCase() !== 'none' &&
                  String(val).toLowerCase() !== 'no' &&
                  String(val) !== '-'
                ) {
                  glp1Type = String(val);
                }
              }
              // Dose patterns - matches "Semaglutide Dose", "Tirzepatide Dose", "glp1-last-30-medication-dose-mg"
              if (
                key.includes('semaglutidedose') ||
                key.includes('semaglutidedosage') ||
                key.includes('tirzepatidedose') ||
                key.includes('tirzepatidedosage') ||
                key.includes('dosemg') ||
                key.includes('currentglp1dose')
              ) {
                if (
                  val &&
                  String(val) !== '-' &&
                  String(val) !== '0' &&
                  String(val).toLowerCase() !== 'none'
                ) {
                  const numericDose = String(val).replace(/[^\d.]/g, '');
                  if (numericDose && parseFloat(numericDose) > 0) {
                    lastDose = numericDose;
                  }
                }
              }
            }

            if (usedGlp1) {
              return { usedGlp1, glp1Type, lastDose };
            }
          }

          // FOURTH: Check sections array (another intake format)
          // MedLink uses section.entries, other sources use section.questions or section.fields
          if (docJson.sections && Array.isArray(docJson.sections)) {
            let sectionUsedGlp1 = false;
            let sectionGlp1Type: string | null = null;
            let sectionLastDose: string | null = null;

            for (const section of docJson.sections) {
              // Support multiple section entry formats
              const entries = section.questions || section.entries || section.fields || [];
              if (!Array.isArray(entries)) continue;

              for (const q of entries) {
                const key = normalizeKey(q.question || q.field || q.id || q.label || '');
                const val = q.answer || q.value || '';

                // GLP-1 usage check
                if (
                  key.includes('glp1last30') ||
                  key.includes('usedglp1') ||
                  key.includes('glp1inlast30') ||
                  ((key.includes('glp1') || key.includes('glp-1')) && key.includes('30'))
                ) {
                  if (String(val).toLowerCase() === 'yes' || val === true) {
                    sectionUsedGlp1 = true;
                  }
                }
                // GLP-1 type check
                if (
                  key.includes('glp1type') ||
                  key.includes('medicationtype') ||
                  key.includes('recentglp1') ||
                  key.includes('currentglp1') ||
                  key.includes('glp1medication')
                ) {
                  if (
                    val &&
                    String(val).toLowerCase() !== 'none' &&
                    String(val).toLowerCase() !== 'no' &&
                    String(val) !== '-'
                  ) {
                    sectionGlp1Type = String(val);
                  }
                }
                // Dose check
                if (
                  key.includes('semaglutidedose') ||
                  key.includes('semaglutidedosage') ||
                  key.includes('tirzepatidedose') ||
                  key.includes('tirzepatidedosage') ||
                  key.includes('dosemg') ||
                  key.includes('currentglp1dose')
                ) {
                  if (
                    val &&
                    String(val) !== '-' &&
                    String(val) !== '0' &&
                    String(val).toLowerCase() !== 'none'
                  ) {
                    const numericDose = String(val).replace(/[^\d.]/g, '');
                    if (numericDose && parseFloat(numericDose) > 0) {
                      sectionLastDose = numericDose;
                    }
                  }
                }
              }
            }

            if (sectionUsedGlp1) {
              return {
                usedGlp1: sectionUsedGlp1,
                glp1Type: sectionGlp1Type,
                lastDose: sectionLastDose,
              };
            }
          }
        } catch {
          // Document data not JSON or malformed, fall through to metadata check
        }
      }

      // Fall back to checking invoice metadata
      if (!metadata) return { usedGlp1: false, glp1Type: null, lastDose: null };

      // Check exact Airtable field names in metadata first
      const exactMetadataMatch = checkExactAirtableFields(metadata);
      if (exactMetadataMatch) {
        return exactMetadataMatch;
      }

      // Patterns to match (will be normalized for comparison)
      const glp1UsedPatterns = [
        'glp1last30days',
        'glp1last30',
        'usedglp1inlast30days',
        'usedglp1inlast30',
        'glp1usage',
        'usedglp1',
      ];
      const glp1TypePatterns = [
        'glp1type',
        'glp1last30medicationtype',
        'recentglp1medicationtype',
        'currentglp1medication',
        'currentglp1',
        'glp1medication',
        'recentglp1type',
        'glp1medicationtype',
      ];
      const semaDosePatterns = [
        'semaglutidedosage',
        'semaglutidedose',
        'semadose',
        'glp1last30medicationdosemg',
        'glp1dose',
        'glp1dosage',
      ];
      const tirzDosePatterns = ['tirzepatidedosage', 'tirzepatidedose', 'tirzdose'];

      // Helper to find a value by matching patterns against all metadata keys
      const findValueByPatterns = (patterns: string[]): string | null => {
        for (const [key, val] of Object.entries(metadata)) {
          const normalizedKey = normalizeKey(key);
          for (const pattern of patterns) {
            if (normalizedKey.includes(pattern) || pattern.includes(normalizedKey)) {
              if (val && String(val).trim() !== '' && String(val) !== '-') {
                return String(val);
              }
            }
          }
        }
        return null;
      };

      // Find GLP-1 usage
      let usedGlp1 = false;
      const glp1UsedValue = findValueByPatterns(glp1UsedPatterns);
      if (glp1UsedValue && glp1UsedValue.toLowerCase() === 'yes') {
        usedGlp1 = true;
      }

      // Find GLP-1 type
      let glp1Type: string | null = null;
      const typeValue = findValueByPatterns(glp1TypePatterns);
      if (typeValue && typeValue.toLowerCase() !== 'none' && typeValue.toLowerCase() !== 'no') {
        glp1Type = typeValue;
      }

      // Find last dose - check based on medication type
      let lastDose: string | null = null;
      const isTirzepatide = glp1Type?.toLowerCase().includes('tirzepatide');

      if (isTirzepatide) {
        lastDose = findValueByPatterns(tirzDosePatterns) || findValueByPatterns(semaDosePatterns);
      } else {
        lastDose = findValueByPatterns(semaDosePatterns) || findValueByPatterns(tirzDosePatterns);
      }

      // Clean up dose value - remove non-numeric except decimal
      if (lastDose && lastDose !== '0') {
        const numericDose = lastDose.replace(/[^\d.]/g, '');
        if (numericDose && parseFloat(numericDose) > 0) {
          lastDose = numericDose;
        }
      }

      return { usedGlp1, glp1Type, lastDose };
    };

    // Fetch documents separately for patients that might not have them in the relation
    // This handles cases where the Patient -> Document link might not be populated
    // IMPORTANT: Include invoice, refill, AND queued-order patients
    const invoicePatientIds = (invoices as any[]).map((inv: any) => inv.patient.id);
    const refillPatientIds = (refills as any[]).map((ref: any) => ref.patient.id);
    const queuedOrderPatientIds = (queuedOrders as any[]).map((o: any) => o.patient.id);
    const allPatientIds = [
      ...new Set([...invoicePatientIds, ...refillPatientIds, ...queuedOrderPatientIds]),
    ];
    const patientDocsMap = new Map<number, PatientDocumentWithData[]>();

    if (allPatientIds.length > 0) {
      try {
        // Load only metadata (no binary blob) for the MOST RECENT intake form per patient.
        // PERF FIX: Removed `data: true` — blob fields (10-100KB+ each) were causing
        // connection monopolization under connection_limit=1. Intake form data should be
        // loaded lazily via GET /api/patients/[id]/documents/[docId] when needed.
        const allPatientDocs = await prisma.patientDocument.findMany({
          where: {
            patientId: { in: allPatientIds },
            category: 'MEDICAL_INTAKE_FORM',
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['patientId'],
          take: 500,
          select: {
            id: true,
            patientId: true,
            sourceSubmissionId: true,
            category: true,
          },
        });

        for (const doc of allPatientDocs) {
          if (!patientDocsMap.has(doc.patientId)) {
            patientDocsMap.set(doc.patientId, []);
          }
          patientDocsMap.get(doc.patientId)!.push(doc as PatientDocumentWithData);
        }

        logger.info('[PRESCRIPTION-QUEUE] Fetched intake documents', {
          patientCount: allPatientIds.length,
          docsFound: allPatientDocs.length,
          patientsWithDocs: patientDocsMap.size,
        });
      } catch (docError) {
        // Non-fatal: document data is used for GLP-1 extraction, not critical for the queue listing
        logger.warn('[PRESCRIPTION-QUEUE] Failed to load intake documents, continuing without GLP-1 data', {
          error: docError instanceof Error ? docError.message : String(docError),
          patientCount: allPatientIds.length,
        });
      }
    }

    // ─── Phase 2b: Load intake blobs for ALL queue patients ───
    // Intake document blobs contain GLP-1 history and medication preference data.
    // Previously only loaded for "plan-only" invoices (missing medication name), but
    // GLP-1 history extraction needs the intake data for ALL patients — otherwise the
    // queue shows "No GLP-1 history" even when the patient's intake form has it.
    // Queue size is bounded (typically <30 patients), so this is safe to load in bulk.
    const patientDocBlobMap = new Map<number, Buffer | Uint8Array>();
    if (allPatientIds.length > 0) {
      try {
        const blobs = await prisma.patientDocument.findMany({
          where: {
            patientId: { in: allPatientIds },
            category: 'MEDICAL_INTAKE_FORM',
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['patientId'],
          take: 500,
          select: {
            patientId: true,
            data: true,
          },
        });
        for (const blob of blobs) {
          if (blob.data) {
            patientDocBlobMap.set(blob.patientId, blob.data as Buffer | Uint8Array);
          }
        }
        logger.info('[PRESCRIPTION-QUEUE] Loaded intake blobs for queue patients', {
          requested: allPatientIds.length,
          loaded: patientDocBlobMap.size,
        });
      } catch (blobErr) {
        logger.warn('[PRESCRIPTION-QUEUE] Failed to load intake blobs, GLP-1 history may be missing', {
          error: blobErr instanceof Error ? blobErr.message : String(blobErr),
          count: allPatientIds.length,
        });
      }
    }

    // Transform invoice data for frontend
    const invoiceItems = (invoices as any[]).map((invoice: any) => {
      // CRITICAL: Validate clinic consistency between invoice and patient
      // This is a defense-in-depth check to catch multi-tenant isolation violations
      const invoiceClinicId = invoice.clinicId;
      const patientClinicId = invoice.patient.clinicId;

      if (invoiceClinicId !== patientClinicId) {
        logger.error('[PRESCRIPTION-QUEUE] CRITICAL SECURITY: Clinic mismatch detected!', {
          invoiceId: invoice.id,
          invoiceClinicId,
          patientId: invoice.patient.id,
          patientClinicId,
          patientDisplayId: invoice.patient.patientId,
        });
        // We still return the item but flag it so UI can highlight the issue
      }

      // Extract treatment info from metadata or line items
      const metadata = invoice.metadata as Record<string, unknown> | null;
      const lineItems = invoice.lineItems as Array<Record<string, unknown>> | null;

      let treatment = 'Unknown Treatment';
      let medicationType = '';
      let plan = '';

      // Get documents from our separate query (more reliable than relation)
      const patientDocs = patientDocsMap.get(invoice.patient.id) || [];
      const intakeDoc = patientDocs[0] || null;

      const intakeDocBlob = patientDocBlobMap.get(invoice.patient.id) || null;

      const glp1Info = extractGlp1Info(
        metadata,
        intakeDocBlob,
        `${invoice.patient.firstName} ${invoice.patient.lastName}`
      );

      if (metadata) {
        treatment = (metadata.product as string) || treatment;
        medicationType = (metadata.medicationType as string) || '';
        plan = (metadata.plan as string) || '';
      }

      if (lineItems && lineItems.length > 0) {
        const firstItem = lineItems[0];
        if (firstItem.description) {
          treatment = firstItem.description as string;
        }
        if (firstItem.product) {
          treatment = firstItem.product as string;
        }
        if (firstItem.medicationType) {
          medicationType = firstItem.medicationType as string;
        }
        if (firstItem.plan) {
          plan = firstItem.plan as string;
        }
      }

      // Clean up treatment name - remove "product" suffix, invoice numbers (WM-202602-0151), and capitalize
      let cleanTreatment = treatment
        .replace(/product$/i, '') // Remove "product" suffix
        .replace(/\s+WM-\d{6}-\d{4}\s*$/i, '') // Strip WellMedR invoice numbers (e.g. WM-202602-0151)
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Capitalize first letter
      if (cleanTreatment) {
        cleanTreatment = cleanTreatment.charAt(0).toUpperCase() + cleanTreatment.slice(1);
      }

      // Format medication type (capitalize)
      let formattedMedType = medicationType
        ? medicationType.charAt(0).toUpperCase() + medicationType.slice(1).toLowerCase()
        : '';

      // Map plan to duration info FIRST (needed for price-based medication derivation)
      const planDurationMap: Record<string, { label: string; months: number }> = {
        monthly: { label: 'Monthly', months: 1 },
        '1month': { label: 'Monthly', months: 1 },
        '1-month': { label: 'Monthly', months: 1 },
        '1mo': { label: 'Monthly', months: 1 },
        quarterly: { label: 'Quarterly', months: 3 },
        '3month': { label: 'Quarterly', months: 3 },
        '3-month': { label: 'Quarterly', months: 3 },
        '3mo': { label: 'Quarterly', months: 3 },
        semester: { label: '6-Month', months: 6 },
        '6-month': { label: '6-Month', months: 6 },
        '6month': { label: '6-Month', months: 6 },
        '6mo': { label: '6-Month', months: 6 },
        annual: { label: 'Annual', months: 12 },
        yearly: { label: 'Annual', months: 12 },
        '12-month': { label: '12-Month', months: 12 },
        '12month': { label: '12-Month', months: 12 },
        '12mo': { label: '12-Month', months: 12 },
      };

      const planKey = plan.toLowerCase().replace(/[\s-]/g, '');
      // Also try to extract plan months from cleanTreatment (e.g. "6mo Injections" → 6)
      let planFromTreatment = 0;
      const treatmentMonthMatch = cleanTreatment.match(/(\d+)\s*mo/i);
      if (treatmentMonthMatch) {
        planFromTreatment = parseInt(treatmentMonthMatch[1], 10);
      }
      const planInfo = planDurationMap[planKey] || {
        label: plan || (planFromTreatment ? `${planFromTreatment}-Month` : 'Monthly'),
        months: planFromTreatment || 1,
      };

      // ─── Derive medication name for plan-only products ───
      // Priority: 1) metadata.preferredMedication (set by invoice webhook)
      //           2) Price-based derivation (WellMedR has fixed pricing per med+plan)
      //           3) intake document blob extraction
      //           4) glp1Info.glp1Type from intake
      //           5) generic "Semaglutide or Tirzepatide" fallback
      let derivedMedication: string | null = null;
      const isPlanOnly = looksLikePlanOnly(cleanTreatment);
      const isWellmedrClinic = invoice.clinic?.subdomain?.toLowerCase().includes('wellmedr');

      if (!formattedMedType && isPlanOnly) {
        // Priority 1: Use preferredMedication from invoice metadata (set by invoice webhook)
        const preferredMed = metadata?.preferredMedication as string | undefined;
        if (preferredMed && /tirzepatide|semaglutide|mounjaro|zepbound|ozempic|wegovy/i.test(preferredMed)) {
          derivedMedication = preferredMed.charAt(0).toUpperCase() + preferredMed.slice(1).toLowerCase();
        }
        // Priority 2: Price-based derivation for WellMedR (deterministic, no intake needed)
        if (!derivedMedication && isWellmedrClinic) {
          const invoiceAmount = invoice.amount || invoice.amountPaid || 0;
          const priceDerived = deriveWellmedrMedicationFromPrice(invoiceAmount, planInfo.months);
          if (priceDerived) {
            derivedMedication = priceDerived;
          }
        }
        // Priority 3: Extract from intake document blob
        if (!derivedMedication && intakeDocBlob) {
          const docMed = extractMedicationFromDocument(intakeDocBlob);
          if (docMed) {
            derivedMedication = docMed.charAt(0).toUpperCase() + docMed.slice(1).toLowerCase();
          }
        }

        // Debug logging for derivation results
        if (isWellmedrClinic) {
          logger.info('[PRESCRIPTION-QUEUE] WellMedR medication derivation', {
            invoiceId: invoice.id,
            cleanTreatment,
            plan,
            planMonths: planInfo.months,
            amount: invoice.amount,
            amountPaid: invoice.amountPaid,
            metadataSource: metadata?.source,
            metadataProduct: metadata?.product,
            clinicSubdomain: invoice.clinic?.subdomain,
            derivedMedication,
            isPlanOnly,
            hasIntakeBlob: !!intakeDocBlob,
          });
        }
      }

      // Build treatment display string: "Tirzepatide - 6mo Injections" or "Tirzepatide Injections"
      let treatmentDisplay = cleanTreatment;
      if (formattedMedType) {
        treatmentDisplay += ` ${formattedMedType}`;
      }
      // When we derived medication (from metadata, price, or intake), show it first for clarity
      if (derivedMedication) {
        treatmentDisplay = `${derivedMedication} - ${cleanTreatment}`;
      }
      // Use glp1Info.glp1Type when we have it (e.g. patient preference or last-used from intake)
      else if (
        !formattedMedType &&
        !derivedMedication &&
        looksLikePlanOnly(cleanTreatment) &&
        glp1Info.glp1Type
      ) {
        const medName =
          glp1Info.glp1Type.charAt(0).toUpperCase() + glp1Info.glp1Type.slice(1).toLowerCase();
        treatmentDisplay = `${medName} - ${cleanTreatment}`;
      }
      // Fallback: when plan-only and no derivation possible,
      // show "Semaglutide or Tirzepatide - 1mo Injections" so provider knows to verify
      else if (
        !formattedMedType &&
        !derivedMedication &&
        looksLikePlanOnly(cleanTreatment) &&
        invoice.clinic?.subdomain?.toLowerCase().includes('wellmedr')
      ) {
        treatmentDisplay = `Semaglutide or Tirzepatide - ${cleanTreatment}`;
      }

      // Get intake completion date if available
      const intakeCompletedAt = invoice.patient.intakeSubmissions?.[0]?.completedAt || null;

      // Get SOAP note status - CRITICAL for clinical documentation
      const soapNote = invoice.patient.soapNotes?.[0] || null;
      const hasSoapNote = soapNote !== null && soapNote.id !== undefined;
      const soapNoteApproved = soapNote?.status === 'APPROVED' || soapNote?.status === 'LOCKED';

      return {
        // Queue item identification
        queueType: 'invoice' as const,
        invoiceId: invoice.id,
        refillId: null,
        // Patient info
        patientId: invoice.patient.id,
        patientDisplayId: formatPatientDisplayId(invoice.patient.patientId, invoice.patient.id),
        patientName: `${safeDecrypt(invoice.patient.firstName) || invoice.patient.firstName} ${safeDecrypt(invoice.patient.lastName) || invoice.patient.lastName}`,
        // Decrypt PHI fields before returning
        patientEmail: safeDecrypt(invoice.patient.email),
        patientPhone: safeDecrypt(invoice.patient.phone),
        patientDob: safeDecrypt(invoice.patient.dob),
        treatment: treatmentDisplay,
        // Plan info for prescribing - tells provider how many months to prescribe
        plan: planInfo.label,
        planMonths: planInfo.months,
        // Refill info (not applicable for invoice-based queue)
        vialCount: planInfo.months === 6 ? 6 : planInfo.months === 3 ? 3 : 1,
        isRefill: false,
        lastOrderId: null,
        // Amount info
        amount: invoice.amount || invoice.amountPaid,
        amountFormatted: `$${((invoice.amount || invoice.amountPaid) / 100).toFixed(2)}`,
        paidAt: invoice.paidAt,
        createdAt: invoice.createdAt,
        queuedAt: invoice.paidAt, // Use paidAt for sorting
        invoiceNumber: (metadata?.invoiceNumber as string) || `INV-${invoice.id}`,
        intakeCompletedAt,
        // GLP-1 history info for prescribing decisions
        glp1Info: {
          usedGlp1: glp1Info.usedGlp1,
          glp1Type: glp1Info.glp1Type,
          lastDose: glp1Info.lastDose,
        },
        // CRITICAL: SOAP Note status for clinical documentation compliance
        // Providers should review/approve SOAP notes before prescribing
        soapNote: soapNote
          ? {
              id: soapNote.id,
              status: soapNote.status,
              createdAt: soapNote.createdAt,
              approvedAt: soapNote.approvedAt,
              isApproved: soapNoteApproved,
            }
          : null,
        hasSoapNote,
        soapNoteStatus: soapNote?.status || 'MISSING',
        // CRITICAL: Clinic context for Lifefile prescriptions
        // The prescription MUST use this clinic's API credentials and PDF branding
        clinicId: invoice.clinicId,
        clinic: invoice.clinic
          ? {
              id: invoice.clinic.id,
              name: invoice.clinic.name,
              subdomain: invoice.clinic.subdomain,
              lifefileEnabled: invoice.clinic.lifefileEnabled,
              practiceName: invoice.clinic.lifefilePracticeName,
            }
          : null,
        // CRITICAL: Flag for multi-tenant isolation violation detection
        // If true, this record has a clinic mismatch between invoice and patient
        clinicMismatch: invoiceClinicId !== patientClinicId,
        patientClinicId: patientClinicId, // Include for debugging/fixing
        // Hold status (fetched via raw SQL to avoid Prisma schema dependency)
        holdReason: invoiceHoldMap.get(invoice.id)?.reason || null,
        heldAt: invoiceHoldMap.get(invoice.id)?.heldAt || null,
      };
    });

    // Transform refill data for frontend
    const refillItems = (refills as any[]).map((refill: any) => {
      // CRITICAL: Validate clinic consistency between refill and patient
      const refillClinicId = refill.clinicId;
      const refillPatientClinicId = refill.patient.clinicId;

      if (refillClinicId !== refillPatientClinicId) {
        logger.error(
          '[PRESCRIPTION-QUEUE] CRITICAL SECURITY: Clinic mismatch detected in refill!',
          {
            refillId: refill.id,
            refillClinicId,
            patientId: refill.patient.id,
            patientClinicId: refillPatientClinicId,
            patientDisplayId: refill.patient.patientId,
          }
        );
      }

      // Get intake completion date if available
      const intakeCompletedAt = refill.patient.intakeSubmissions?.[0]?.completedAt || null;

      // Get SOAP note status - CRITICAL for clinical documentation
      const soapNote = refill.patient.soapNotes?.[0] || null;
      const hasSoapNote = soapNote !== null && soapNote.id !== undefined;
      const soapNoteApproved = soapNote?.status === 'APPROVED' || soapNote?.status === 'LOCKED';

      // Build treatment display from refill medication info
      const treatmentDisplay = refill.medicationName
        ? `${refill.medicationName}${refill.medicationStrength ? ` ${refill.medicationStrength}` : ''}`
        : 'Refill Prescription';

      // Map vial count to plan months
      const planMonths = refill.vialCount === 6 ? 6 : refill.vialCount === 3 ? 3 : 1;
      const planLabel = planMonths === 6 ? '6-Month' : planMonths === 3 ? 'Quarterly' : 'Monthly';

      // Refill patients are already GLP-1 users - extract type from medication name
      const istirzepatide = treatmentDisplay.toLowerCase().includes('tirzepatide');
      const isSemaglutide = treatmentDisplay.toLowerCase().includes('semaglutide');

      const refillBlob = patientDocBlobMap.get(refill.patient.id) || null;
      const docGlp1Info = refillBlob ? extractGlp1Info(null, refillBlob) : null;

      return {
        // Queue item identification
        queueType: 'refill' as const,
        invoiceId: refill.invoiceId,
        refillId: refill.id,
        // Patient info
        patientId: refill.patient.id,
        patientDisplayId: formatPatientDisplayId(refill.patient.patientId, refill.patient.id),
        patientName: `${safeDecrypt(refill.patient.firstName) || refill.patient.firstName} ${safeDecrypt(refill.patient.lastName) || refill.patient.lastName}`,
        patientEmail: safeDecrypt(refill.patient.email),
        patientPhone: safeDecrypt(refill.patient.phone),
        patientDob: safeDecrypt(refill.patient.dob),
        treatment: treatmentDisplay,
        // Plan info for prescribing
        plan: refill.planName || planLabel,
        planMonths,
        // Refill info
        vialCount: refill.vialCount,
        isRefill: true,
        lastOrderId: refill.lastOrderId,
        refillIntervalDays: refill.refillIntervalDays,
        nextRefillDate: refill.nextRefillDate,
        requestedEarly: refill.requestedEarly,
        patientNotes: refill.patientNotes,
        // Amount info (from linked invoice if available)
        amount: null,
        amountFormatted: '-',
        paidAt: refill.paymentVerifiedAt,
        createdAt: refill.createdAt,
        queuedAt: refill.providerQueuedAt || refill.adminApprovedAt || refill.createdAt, // Use providerQueuedAt for sorting
        invoiceNumber: refill.invoiceId ? `INV-${refill.invoiceId}` : `REFILL-${refill.id}`,
        intakeCompletedAt,
        // GLP-1 history info - refill patients are existing GLP-1 users
        // Prefer document data if available (has original intake info), fallback to medication info
        glp1Info: {
          usedGlp1: true, // Refill = they've used it before
          glp1Type:
            docGlp1Info?.glp1Type ||
            (istirzepatide ? 'Tirzepatide' : isSemaglutide ? 'Semaglutide' : refill.medicationName),
          lastDose: docGlp1Info?.lastDose || refill.medicationStrength || null,
        },
        // SOAP Note status
        soapNote: soapNote
          ? {
              id: soapNote.id,
              status: soapNote.status,
              createdAt: soapNote.createdAt,
              approvedAt: soapNote.approvedAt,
              isApproved: soapNoteApproved,
            }
          : null,
        hasSoapNote,
        soapNoteStatus: soapNote?.status || 'MISSING',
        // Clinic context
        clinicId: refill.clinicId,
        clinic: refill.clinic
          ? {
              id: refill.clinic.id,
              name: refill.clinic.name,
              subdomain: refill.clinic.subdomain,
              lifefileEnabled: refill.clinic.lifefileEnabled,
              practiceName: refill.clinic.lifefilePracticeName,
            }
          : null,
        // Subscription info
        subscription: refill.subscription
          ? {
              id: refill.subscription.id,
              planName: refill.subscription.planName,
              status: refill.subscription.status,
            }
          : null,
        // CRITICAL: Flag for multi-tenant isolation violation detection
        clinicMismatch: refillClinicId !== refillPatientClinicId,
        patientClinicId: refillPatientClinicId,
        // Hold status (fetched via raw SQL)
        holdReason: refill.status === 'ON_HOLD' ? (refillHoldMap.get(refill.id) || 'Held for more information') : null,
        heldAt: refill.status === 'ON_HOLD' ? refill.updatedAt?.toISOString() : null,
      };
    });

    // Transform admin-queued orders (awaiting provider approval and send to pharmacy)
    const queuedOrderItems = (queuedOrders as any[]).map((order: any) => {
      const soapNote = order.patient?.soapNotes?.[0] || null;
      const hasSoapNote = soapNote !== null && soapNote.id !== undefined;
      const soapNoteApproved = soapNote?.status === 'APPROVED' || soapNote?.status === 'LOCKED';
      const treatmentDisplay = order.primaryMedName
        ? `${order.primaryMedName}${order.primaryMedStrength ? ` ${order.primaryMedStrength}` : ''}${order.primaryMedForm ? ` ${order.primaryMedForm}` : ''}`
        : 'Prescription (queued by admin)';
      const queuedOrderBlob = patientDocBlobMap.get(order.patient.id) || null;
      const queuedOrderGlp1 = extractGlp1Info(null, queuedOrderBlob);
      return {
        queueType: 'queued_order' as const,
        orderId: order.id,
        invoiceId: null,
        refillId: null,
        patientId: order.patient.id,
        patientDisplayId: formatPatientDisplayId(order.patient.patientId, order.patient.id),
        patientName: `${safeDecrypt(order.patient.firstName) || order.patient.firstName} ${safeDecrypt(order.patient.lastName) || order.patient.lastName}`,
        patientEmail: safeDecrypt(order.patient.email),
        patientPhone: safeDecrypt(order.patient.phone),
        patientDob: safeDecrypt(order.patient.dob),
        treatment: treatmentDisplay,
        plan: 'N/A',
        planMonths: 1,
        vialCount: 1,
        isRefill: false,
        lastOrderId: null,
        amount: null,
        amountFormatted: '-',
        paidAt: order.queuedForProviderAt,
        createdAt: order.createdAt,
        queuedAt: order.queuedForProviderAt,
        invoiceNumber: `QUEUED-${order.id}`,
        intakeCompletedAt: null,
        glp1Info: queuedOrderGlp1,
        soapNote: soapNote
          ? {
              id: soapNote.id,
              status: soapNote.status,
              createdAt: soapNote.createdAt,
              approvedAt: soapNote.approvedAt,
              isApproved: soapNoteApproved,
            }
          : null,
        hasSoapNote,
        soapNoteStatus: soapNote?.status || 'MISSING',
        clinicId: order.clinicId,
        clinic: order.clinic
          ? {
              id: order.clinic.id,
              name: order.clinic.name,
              subdomain: order.clinic.subdomain,
              lifefileEnabled: order.clinic.lifefileEnabled,
              practiceName: order.clinic.lifefilePracticeName,
            }
          : null,
        clinicMismatch: false,
        patientClinicId: order.patient.clinicId,
        // For approve-and-send: order payload is in requestJson; provider and rxs on order
        provider: order.provider,
        rxs: order.rxs,
        requestJson: order.requestJson,
        queuedByUserId: order.queuedByUserId,
        holdReason: order.status === 'needs_info' ? 'Held for more information' : null,
        heldAt: order.status === 'needs_info' ? order.updatedAt?.toISOString() : null,
      };
    });

    // Combine and sort by queuedAt (oldest first - FIFO)
    const queueItems = [...invoiceItems, ...refillItems, ...queuedOrderItems].sort((a, b) => {
      const dateA = new Date(a.queuedAt || a.createdAt).getTime();
      const dateB = new Date(b.queuedAt || b.createdAt).getTime();
      return dateA - dateB;
    });

    logger.info('[PRESCRIPTION-QUEUE] Queue loaded successfully', {
      userId: user.id,
      invoiceCount,
      refillCount,
      queuedOrderCount,
      totalItems: queueItems.length,
    });

    return NextResponse.json({
      items: queueItems,
      total: totalCount,
      invoiceCount,
      refillCount,
      queuedOrderCount,
      limit,
      offset,
      hasMore: offset + queueItems.length < totalCount,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.constructor.name : 'Unknown';
    const errorStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined;
    logger.error('[PRESCRIPTION-QUEUE] Error fetching queue', {
      error: errorMessage,
      errorType: errorName,
      stack: errorStack,
      userId: user.id,
      providerId: user.providerId,
      clinicId: user.clinicId,
    });
    return handleApiError(error, { route: 'GET /api/provider/prescription-queue' });
  }
}

/**
 * PATCH /api/provider/prescription-queue
 * Actions: mark_processed (default), hold_for_info, resume_from_hold
 *
 * Body:
 * - invoiceId / refillId / orderId: identifies the queue item
 * - action?: 'hold_for_info' | 'resume_from_hold' (omit for legacy mark-processed)
 * - reason?: string (required for hold_for_info)
 */
async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoiceId, refillId, orderId, action, reason } = body;

    if (!invoiceId && !refillId && !orderId) {
      return NextResponse.json({ error: 'Invoice ID, Refill ID, or Order ID is required' }, { status: 400 });
    }

    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'No clinic context. Please log in again.' },
        { status: 400 }
      );
    }
    const clinicIds = [user.clinicId];

    let providerId: number | null = null;
    if (user.id) {
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { providerId: true },
      });
      providerId = userData?.providerId || null;
    }

    // ── Hold for Info ──────────────────────────────────────────────────────
    if (action === 'hold_for_info') {
      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return NextResponse.json({ error: 'A reason is required (min 5 characters)' }, { status: 400 });
      }

      if (refillId) {
        const refill = await prisma.refillQueue.findFirst({
          where: { id: refillId, clinicId: { in: clinicIds }, status: { in: ['APPROVED', 'PENDING_PROVIDER'] } },
        });
        if (!refill) {
          return NextResponse.json({ error: 'Refill not found or not in active queue' }, { status: 404 });
        }
        await prisma.refillQueue.update({
          where: { id: refillId },
          data: { status: 'ON_HOLD' },
        });
        // Set providerHoldReason via raw SQL (column not in Prisma schema)
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE "RefillQueue" SET "providerHoldReason" = $1 WHERE id = $2`,
            reason.trim(), refillId
          );
        } catch { /* column may not exist yet */ }
        logger.info('[PRESCRIPTION-QUEUE] Refill held for more info', { refillId, userId: user.id });
        return NextResponse.json({ success: true, message: 'Refill held for more information' });
      }

      if (orderId) {
        const order = await prisma.order.findFirst({
          where: { id: orderId, clinicId: { in: clinicIds }, status: 'queued_for_provider' },
        });
        if (!order) {
          return NextResponse.json({ error: 'Order not found or not in active queue' }, { status: 404 });
        }
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'needs_info' },
        });
        logger.info('[PRESCRIPTION-QUEUE] Queued order held for more info', { orderId, userId: user.id });
        return NextResponse.json({ success: true, message: 'Order held for more information' });
      }

      // Invoice hold (uses raw SQL since hold columns are not in Prisma schema)
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, clinicId: { in: clinicIds }, status: 'PAID', prescriptionProcessed: false },
        select: { id: true },
      });
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found or not in active queue' }, { status: 404 });
      }
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Invoice" SET "prescriptionHoldReason" = $1, "prescriptionHeldAt" = NOW(), "prescriptionHeldBy" = $2 WHERE id = $3`,
          reason.trim(), providerId ?? user.id, invoiceId
        );
      } catch (sqlErr: any) {
        logger.warn('[PRESCRIPTION-QUEUE] Hold columns missing - run migration 20260228120000', { error: sqlErr?.message?.substring(0, 100) });
        return NextResponse.json({ error: 'Hold feature requires a database migration. Please contact your administrator.' }, { status: 503 });
      }
      logger.info('[PRESCRIPTION-QUEUE] Invoice held for more info', { invoiceId, userId: user.id });
      return NextResponse.json({ success: true, message: 'Prescription held for more information' });
    }

    // ── Resume from Hold ───────────────────────────────────────────────────
    if (action === 'resume_from_hold') {
      if (refillId) {
        const refill = await prisma.refillQueue.findFirst({
          where: { id: refillId, clinicId: { in: clinicIds }, status: 'ON_HOLD' },
        });
        if (!refill) {
          return NextResponse.json({ error: 'Held refill not found' }, { status: 404 });
        }
        const resumeStatus = refill.adminApproved ? 'APPROVED' : 'PENDING_PROVIDER';
        await prisma.refillQueue.update({
          where: { id: refillId },
          data: { status: resumeStatus },
        });
        try {
          await prisma.$executeRawUnsafe(`UPDATE "RefillQueue" SET "providerHoldReason" = NULL WHERE id = $1`, refillId);
        } catch { /* column may not exist yet */ }
        logger.info('[PRESCRIPTION-QUEUE] Refill resumed from hold', { refillId, userId: user.id });
        return NextResponse.json({ success: true, message: 'Refill returned to queue' });
      }

      if (orderId) {
        const order = await prisma.order.findFirst({
          where: { id: orderId, clinicId: { in: clinicIds }, status: 'needs_info' },
        });
        if (!order) {
          return NextResponse.json({ error: 'Held order not found' }, { status: 404 });
        }
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'queued_for_provider' },
        });
        logger.info('[PRESCRIPTION-QUEUE] Queued order resumed from hold', { orderId, userId: user.id });
        return NextResponse.json({ success: true, message: 'Order returned to queue' });
      }

      // Invoice resume (uses raw SQL since hold columns are not in Prisma schema)
      const invoiceForResume = await prisma.invoice.findFirst({
        where: { id: invoiceId, clinicId: { in: clinicIds }, status: 'PAID', prescriptionProcessed: false },
        select: { id: true },
      });
      if (!invoiceForResume) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Invoice" SET "prescriptionHoldReason" = NULL, "prescriptionHeldAt" = NULL, "prescriptionHeldBy" = NULL WHERE id = $1`,
          invoiceId
        );
      } catch (sqlErr: any) {
        logger.warn('[PRESCRIPTION-QUEUE] Hold columns missing - run migration 20260228120000', { error: sqlErr?.message?.substring(0, 100) });
        return NextResponse.json({ error: 'Hold feature requires a database migration. Please contact your administrator.' }, { status: 503 });
      }
      logger.info('[PRESCRIPTION-QUEUE] Invoice resumed from hold', { invoiceId, userId: user.id });
      return NextResponse.json({ success: true, message: 'Prescription returned to queue' });
    }

    // ── Mark Processed (legacy default) ────────────────────────────────────

    // Handle refill-based queue items
    if (refillId && !invoiceId) {
      const refill = await prisma.refillQueue.findFirst({
        where: {
          id: refillId,
          clinicId: { in: clinicIds },
          status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (!refill) {
        const alreadyPrescribed = await prisma.refillQueue.findFirst({
          where: { id: refillId, clinicId: { in: clinicIds }, status: 'PRESCRIBED' },
          select: { id: true, status: true },
        });
        if (alreadyPrescribed) {
          return NextResponse.json({
            success: true,
            message: 'Refill already marked as processed',
            refill: { id: alreadyPrescribed.id, status: alreadyPrescribed.status },
          });
        }
        return NextResponse.json(
          { error: 'Refill not found or does not belong to your clinic' },
          { status: 404 }
        );
      }

      const updatedRefill = await prisma.refillQueue.update({
        where: { id: refillId },
        data: {
          status: 'PRESCRIBED',
          prescribedAt: new Date(),
          prescribedBy: providerId,
        },
      });

      logger.info('[PRESCRIPTION-QUEUE] Refill marked as processed', {
        refillId,
        patientId: refill.patient.id,
        processedBy: user.email,
        providerId,
        clinicId: refill.clinicId,
      });

      return NextResponse.json({
        success: true,
        message: 'Refill prescription marked as processed',
        refill: {
          id: updatedRefill.id,
          status: updatedRefill.status,
        },
      });
    }

    // Handle invoice-based queue items
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clinicId: { in: clinicIds },
        status: 'PAID',
        prescriptionProcessed: false,
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            lifefileEnabled: true,
          },
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            clinicId: true,
          },
        },
      },
    });

    if (!invoice) {
      const alreadyProcessed = await prisma.invoice.findFirst({
        where: { id: invoiceId, clinicId: { in: clinicIds }, prescriptionProcessed: true },
        select: { id: true, prescriptionProcessedAt: true },
      });
      if (alreadyProcessed) {
        return NextResponse.json({
          success: true,
          message: 'Invoice already marked as processed',
          invoice: {
            id: alreadyProcessed.id,
            prescriptionProcessed: true,
            prescriptionProcessedAt: alreadyProcessed.prescriptionProcessedAt,
            clinicId: user.clinicId,
          },
        });
      }
      return NextResponse.json(
        { error: 'Invoice not found or does not belong to your clinic' },
        { status: 404 }
      );
    }

    if (invoice.patient.clinicId !== invoice.clinicId) {
      logger.warn('Clinic mismatch: patient clinic differs from invoice clinic', {
        invoiceId,
        invoiceClinicId: invoice.clinicId,
        patientClinicId: invoice.patient.clinicId,
      });
    }

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        prescriptionProcessed: true,
        prescriptionProcessedAt: new Date(),
        prescriptionProcessedBy: providerId,
      },
    });

    logger.info('Prescription marked as processed', {
      invoiceId,
      patientId: invoice.patient.id,
      processedBy: user.email,
      providerId,
      clinicId: invoice.clinicId,
      clinicName: invoice.clinic?.name,
      lifefileEnabled: invoice.clinic?.lifefileEnabled,
    });

    return NextResponse.json({
      success: true,
      message: 'Prescription marked as processed',
      invoice: {
        id: updatedInvoice.id,
        prescriptionProcessed: updatedInvoice.prescriptionProcessed,
        prescriptionProcessedAt: updatedInvoice.prescriptionProcessedAt,
        clinicId: invoice.clinicId,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in prescription queue PATCH', {
      error: errorMessage,
      userId: user.id,
    });
    return handleApiError(error, { route: 'PATCH /api/provider/prescription-queue' });
  }
}

/**
 * POST /api/provider/prescription-queue
 * Decline a prescription request
 *
 * Body:
 * - invoiceId: ID of the invoice to decline
 * - reason: Reason for declining the prescription
 */
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoiceId, reason } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'A reason for declining is required (minimum 10 characters)' },
        { status: 400 }
      );
    }

    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'No clinic context. Please log in again.' },
        { status: 400 }
      );
    }
    const clinicIds = [user.clinicId];

    // Verify invoice exists, belongs to provider's current clinic, and is in the queue
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clinicId: { in: clinicIds },
        status: 'PAID',
        prescriptionProcessed: false,
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found, does not belong to your clinic, or already processed' },
        { status: 404 }
      );
    }

    // Get provider ID if user is linked to a provider
    let providerId: number | null = null;
    let providerName = user.email;
    if (user.id) {
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          providerId: true,
          provider: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      providerId = userData?.providerId || null;
      if (userData?.provider) {
        providerName = `${userData.provider.firstName} ${userData.provider.lastName}`;
      }
    }

    // Update invoice: mark as processed but with decline info in metadata
    const existingMetadata = (invoice.metadata as Record<string, unknown>) || {};
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        prescriptionProcessed: true,
        prescriptionProcessedAt: new Date(),
        prescriptionProcessedBy: providerId,
        metadata: {
          ...existingMetadata,
          prescriptionDeclined: true,
          prescriptionDeclinedAt: new Date().toISOString(),
          prescriptionDeclinedBy: user.email,
          prescriptionDeclinedByName: providerName,
          prescriptionDeclinedReason: reason.trim(),
        },
      },
    });

    logger.info('[PRESCRIPTION-QUEUE] Prescription declined', {
      invoiceId,
      patientId: invoice.patient.id,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      declinedBy: user.email,
      providerName,
      providerId,
      reason: reason.trim(),
      clinicId: invoice.clinicId,
      clinicName: invoice.clinic?.name,
    });

    // TODO: Optional - Send notification email to patient about declined prescription
    // Could integrate with email service here

    return NextResponse.json({
      success: true,
      message: 'Prescription declined',
      invoice: {
        id: updatedInvoice.id,
        prescriptionProcessed: updatedInvoice.prescriptionProcessed,
        prescriptionDeclined: true,
        declinedBy: providerName,
        declinedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PRESCRIPTION-QUEUE] Error declining prescription', {
      error: errorMessage,
      userId: user.id,
    });
    return handleApiError(error, { route: 'POST /api/provider/prescription-queue' });
  }
}

export const GET = withProviderAuth(handleGet);
export const PATCH = withProviderAuth(handlePatch);
export const POST = withProviderAuth(handlePost);
