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
import { decrypt } from '@/lib/security/encryption';
import { ensureSoapNoteExists } from '@/lib/soap-note-automation';
import type { Invoice, Clinic, Patient, IntakeFormSubmission, SOAPNote, RefillQueue, Subscription } from '@prisma/client';

// Helper to safely decrypt a field
const safeDecrypt = (value: string | null): string | null => {
  if (!value) return value;
  try {
    // Check if it looks encrypted (3 base64 parts with colons)
    const parts = value.split(':');
    if (parts.length === 3 && parts.every(p => /^[A-Za-z0-9+/]+=*$/.test(p))) {
      return decrypt(value);
    }
    return value; // Not encrypted, return as-is
  } catch (e) {
    logger.warn('[PRESCRIPTION-QUEUE] Failed to decrypt patient field', {
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return value; // Return original on error
  }
};

// Type for PatientDocument with intake data
type PatientDocumentWithData = {
  id: number;
  data: Buffer | null;
  sourceSubmissionId: string | null;
};

// Type for invoice with included relations from our query
type InvoiceWithRelations = Invoice & {
  clinic: Pick<Clinic, 'id' | 'name' | 'subdomain' | 'lifefileEnabled' | 'lifefilePracticeName'> | null;
  patient: Pick<Patient, 'id' | 'patientId' | 'firstName' | 'lastName' | 'email' | 'phone' | 'dob' | 'clinicId'> & {
    intakeSubmissions: Pick<IntakeFormSubmission, 'id' | 'completedAt'>[];
    soapNotes: Pick<SOAPNote, 'id' | 'status' | 'createdAt' | 'approvedAt' | 'approvedBy'>[];
    documents: PatientDocumentWithData[];
  };
};

// Type for refill queue with included relations
type RefillWithRelations = RefillQueue & {
  clinic: Pick<Clinic, 'id' | 'name' | 'subdomain' | 'lifefileEnabled' | 'lifefilePracticeName'> | null;
  patient: Pick<Patient, 'id' | 'patientId' | 'firstName' | 'lastName' | 'email' | 'phone' | 'dob' | 'clinicId'> & {
    intakeSubmissions: Pick<IntakeFormSubmission, 'id' | 'completedAt'>[];
    soapNotes: Pick<SOAPNote, 'id' | 'status' | 'createdAt' | 'approvedAt' | 'approvedBy'>[];
    documents: PatientDocumentWithData[];
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    logger.info('[PRESCRIPTION-QUEUE] GET request', {
      userId: user.id,
      userEmail: user.email,
      clinicId: user.clinicId,
    });

    // Get provider's clinic ID
    const clinicId = user.clinicId;
    if (!clinicId) {
      logger.warn('[PRESCRIPTION-QUEUE] Provider has no clinic', { userId: user.id });
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    // Query paid invoices that haven't been processed yet
    // CRITICAL: Include clinic info for Lifefile prescription context
    // NOTE: We don't require IntakeFormSubmission because:
    // - WellMedR/Heyflow patients have intake data in invoice metadata, not IntakeFormSubmission
    // - EONmeds patients use internal intake forms (IntakeFormSubmission)
    // The prescription process handles both scenarios
    const [invoices, invoiceCount, refills, refillCount] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          clinicId: clinicId,
          status: 'PAID',
          prescriptionProcessed: false,
        },
        include: {
          // CRITICAL: Include clinic for prescription context (Lifefile API, PDF branding)
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
              clinicId: true, // Patient's clinic for validation
              intakeSubmissions: {
                where: { status: 'completed' },
                orderBy: { completedAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  completedAt: true,
                },
              },
              // CRITICAL: Include SOAP notes for clinical documentation compliance
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
              // Include intake documents for GLP-1 history
              documents: {
                where: { category: 'MEDICAL_INTAKE_FORM' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  data: true,
                  sourceSubmissionId: true,
                },
              },
            },
          },
        },
        orderBy: {
          paidAt: 'asc', // Oldest paid first (FIFO queue)
        },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({
        where: {
          clinicId: clinicId,
          status: 'PAID',
          prescriptionProcessed: false,
        },
      }),
      // Query approved refills from RefillQueue
      prisma.refillQueue.findMany({
        where: {
          clinicId: clinicId,
          status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
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
              // Include intake documents for GLP-1 history
              documents: {
                where: { category: 'MEDICAL_INTAKE_FORM' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  data: true,
                  sourceSubmissionId: true,
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
          providerQueuedAt: 'asc', // Oldest queued first (FIFO)
        },
        take: limit,
        skip: offset,
      }),
      prisma.refillQueue.count({
        where: {
          clinicId: clinicId,
          status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
        },
      }),
    ]);
    
    const totalCount = invoiceCount + refillCount;

    // Helper function to normalize keys for comparison (lowercase, remove spaces/dashes/underscores)
    const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_\s]/g, '');

    // Helper function to extract GLP-1 info from metadata and/or document data
    const extractGlp1Info = (
      metadata: Record<string, unknown> | null,
      documentData: Buffer | null
    ) => {
      // First try to get GLP-1 info from PatientDocument (intake form data)
      if (documentData) {
        try {
          const docJson = JSON.parse(documentData.toString('utf8'));

          // Check for glp1History structure (WellMedR intake format)
          if (docJson.glp1History) {
            const history = docJson.glp1History;
            const usedLast30 = history.usedLast30Days;
            const medType = history.medicationType;
            const doseMg = history.doseMg;

            if (usedLast30 && (usedLast30.toLowerCase() === 'yes' || usedLast30 === true)) {
              return {
                usedGlp1: true,
                glp1Type: medType || null,
                lastDose: doseMg ? String(doseMg) : null,
              };
            }
          }

          // Also check the answers array for GLP-1 fields
          if (docJson.answers && Array.isArray(docJson.answers)) {
            let usedGlp1 = false;
            let glp1Type: string | null = null;
            let lastDose: string | null = null;

            for (const answer of docJson.answers) {
              const key = normalizeKey(answer.question || answer.field || '');
              const val = answer.answer || answer.value || '';

              if (key.includes('glp1last30') || key.includes('usedglp1')) {
                if (String(val).toLowerCase() === 'yes') {
                  usedGlp1 = true;
                }
              }
              if (key.includes('glp1type') || key.includes('medicationtype') || key.includes('recentglp1')) {
                if (val && String(val).toLowerCase() !== 'none') {
                  glp1Type = String(val);
                }
              }
              if (key.includes('semaglutidedose') || key.includes('tirzepatidedose') || key.includes('dosemg')) {
                if (val && String(val) !== '-' && String(val) !== '0') {
                  lastDose = String(val).replace(/[^\d.]/g, '');
                }
              }
            }

            if (usedGlp1) {
              return { usedGlp1, glp1Type, lastDose };
            }
          }
        } catch (e) {
          // Document data not JSON or malformed, fall through to metadata check
        }
      }

      // Fall back to checking invoice metadata
      if (!metadata) return { usedGlp1: false, glp1Type: null, lastDose: null };

      // Patterns to match (will be normalized for comparison)
      const glp1UsedPatterns = [
        'glp1last30days', 'glp1last30', 'usedglp1inlast30days',
        'usedglp1inlast30', 'glp1usage', 'usedglp1'
      ];
      const glp1TypePatterns = [
        'glp1type', 'glp1last30medicationtype', 'recentglp1medicationtype',
        'currentglp1medication', 'currentglp1', 'glp1medication',
        'recentglp1type', 'glp1medicationtype'
      ];
      const semaDosePatterns = [
        'semaglutidedosage', 'semaglutidedose', 'semadose',
        'glp1last30medicationdosemg', 'glp1dose', 'glp1dosage'
      ];
      const tirzDosePatterns = [
        'tirzepatidedosage', 'tirzepatidedose', 'tirzdose'
      ];

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

    // Transform invoice data for frontend
    const invoiceItems = invoices.map((invoice: InvoiceWithRelations) => {
      // Extract treatment info from metadata or line items
      const metadata = invoice.metadata as Record<string, unknown> | null;
      const lineItems = invoice.lineItems as Array<Record<string, unknown>> | null;

      let treatment = 'Unknown Treatment';
      let medicationType = '';
      let plan = '';

      // Extract GLP-1 history info from PatientDocument or invoice metadata
      const documentData = invoice.patient.documents?.[0]?.data || null;
      const glp1Info = extractGlp1Info(metadata, documentData);

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

      // Clean up treatment name - remove "product" suffix and capitalize
      let cleanTreatment = treatment
        .replace(/product$/i, '')  // Remove "product" suffix
        .replace(/\s+/g, ' ')      // Normalize spaces
        .trim();
      
      // Capitalize first letter
      if (cleanTreatment) {
        cleanTreatment = cleanTreatment.charAt(0).toUpperCase() + cleanTreatment.slice(1);
      }

      // Format medication type (capitalize)
      const formattedMedType = medicationType 
        ? medicationType.charAt(0).toUpperCase() + medicationType.slice(1).toLowerCase()
        : '';

      // Map plan to duration info for prescribing
      const planDurationMap: Record<string, { label: string; months: number }> = {
        'monthly': { label: 'Monthly', months: 1 },
        'quarterly': { label: 'Quarterly', months: 3 },
        'semester': { label: '6-Month', months: 6 },
        '6-month': { label: '6-Month', months: 6 },
        '6month': { label: '6-Month', months: 6 },
        'annual': { label: 'Annual', months: 12 },
        'yearly': { label: 'Annual', months: 12 },
      };
      
      const planKey = plan.toLowerCase().replace(/[\s-]/g, '');
      const planInfo = planDurationMap[planKey] || { label: plan || 'Monthly', months: 1 };

      // Build treatment display string: "Tirzepatide Injections"
      let treatmentDisplay = cleanTreatment;
      if (formattedMedType) {
        treatmentDisplay += ` ${formattedMedType}`;
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
        patientDisplayId: invoice.patient.patientId,
        patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
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
        soapNote: soapNote ? {
          id: soapNote.id,
          status: soapNote.status,
          createdAt: soapNote.createdAt,
          approvedAt: soapNote.approvedAt,
          isApproved: soapNoteApproved,
        } : null,
        hasSoapNote,
        soapNoteStatus: soapNote?.status || 'MISSING',
        // CRITICAL: Clinic context for Lifefile prescriptions
        // The prescription MUST use this clinic's API credentials and PDF branding
        clinicId: invoice.clinicId,
        clinic: invoice.clinic ? {
          id: invoice.clinic.id,
          name: invoice.clinic.name,
          subdomain: invoice.clinic.subdomain,
          lifefileEnabled: invoice.clinic.lifefileEnabled,
          practiceName: invoice.clinic.lifefilePracticeName,
        } : null,
      };
    });
    
    // Transform refill data for frontend
    const refillItems = refills.map((refill: RefillWithRelations) => {
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

      return {
        // Queue item identification
        queueType: 'refill' as const,
        invoiceId: refill.invoiceId,
        refillId: refill.id,
        // Patient info
        patientId: refill.patient.id,
        patientDisplayId: refill.patient.patientId,
        patientName: `${refill.patient.firstName} ${refill.patient.lastName}`,
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
        glp1Info: {
          usedGlp1: true, // Refill = they've used it before
          glp1Type: istirzepatide ? 'Tirzepatide' : isSemaglutide ? 'Semaglutide' : refill.medicationName,
          lastDose: refill.medicationStrength || null,
        },
        // SOAP Note status
        soapNote: soapNote ? {
          id: soapNote.id,
          status: soapNote.status,
          createdAt: soapNote.createdAt,
          approvedAt: soapNote.approvedAt,
          isApproved: soapNoteApproved,
        } : null,
        hasSoapNote,
        soapNoteStatus: soapNote?.status || 'MISSING',
        // Clinic context
        clinicId: refill.clinicId,
        clinic: refill.clinic ? {
          id: refill.clinic.id,
          name: refill.clinic.name,
          subdomain: refill.clinic.subdomain,
          lifefileEnabled: refill.clinic.lifefileEnabled,
          practiceName: refill.clinic.lifefilePracticeName,
        } : null,
        // Subscription info
        subscription: refill.subscription ? {
          id: refill.subscription.id,
          planName: refill.subscription.planName,
          status: refill.subscription.status,
        } : null,
      };
    });
    
    // Combine and sort by queuedAt (oldest first - FIFO)
    const queueItems = [...invoiceItems, ...refillItems].sort((a, b) => {
      const dateA = new Date(a.queuedAt || a.createdAt).getTime();
      const dateB = new Date(b.queuedAt || b.createdAt).getTime();
      return dateA - dateB;
    });

    return NextResponse.json({
      items: queueItems,
      total: totalCount,
      invoiceCount,
      refillCount,
      limit,
      offset,
      hasMore: offset + queueItems.length < totalCount,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[PRESCRIPTION-QUEUE] Error fetching queue', {
      error: errorMessage,
      stack: errorStack,
      userId: user.id,
      clinicId: user.clinicId,
    });
    return NextResponse.json(
      { error: 'Failed to fetch prescription queue', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/provider/prescription-queue
 * Mark a prescription as processed
 * 
 * Body:
 * - invoiceId: ID of the invoice to mark as processed
 */
async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Get provider's clinic ID
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify invoice exists, belongs to provider's clinic, and is in the queue
    // This ensures prescriptions use the correct clinic context for:
    // - Lifefile API credentials (pharmacy routing, billing)
    // - E-prescription PDF branding (clinic name, address, phone)
    // - Tracking webhook routing back to correct clinic
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clinicId: clinicId, // CRITICAL: Must match provider's active clinic
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
      return NextResponse.json(
        { error: 'Invoice not found, does not belong to your clinic, or already processed' },
        { status: 404 }
      );
    }

    // CRITICAL: Validate clinic context consistency
    if (invoice.patient.clinicId !== clinicId) {
      logger.warn('Clinic mismatch: patient clinic differs from invoice clinic', {
        invoiceId,
        invoiceClinicId: invoice.clinicId,
        patientClinicId: invoice.patient.clinicId,
        providerClinicId: clinicId,
      });
      // Allow processing but log the mismatch for audit
    }

    // Get provider ID if user is linked to a provider
    let providerId: number | null = null;
    if (user.id) {
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { providerId: true },
      });
      providerId = userData?.providerId || null;
    }

    // Mark as processed
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
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      processedBy: user.email,
      providerId,
      // CRITICAL: Log clinic context for audit trail
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
        // Return clinic context so frontend can use correct clinic for prescription
        clinicId: invoice.clinicId,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error marking prescription as processed', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to mark prescription as processed' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'A reason for declining is required (minimum 10 characters)' },
        { status: 400 }
      );
    }

    // Get provider's clinic ID
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Provider must be associated with a clinic' },
        { status: 400 }
      );
    }

    // Verify invoice exists, belongs to provider's clinic, and is in the queue
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clinicId: clinicId,
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
            }
          }
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
    return NextResponse.json(
      { error: 'Failed to decline prescription' },
      { status: 500 }
    );
  }
}

export const GET = withProviderAuth(handleGet);
export const PATCH = withProviderAuth(handlePatch);
export const POST = withProviderAuth(handlePost);
