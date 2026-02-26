import lifefile, { LifefileOrderPayload, getEnvCredentials } from '@/lib/lifefile';
import { getClinicLifefileClient, getClinicLifefileCredentials } from '@/lib/clinic-lifefile';
import { prescriptionSchema } from '@/lib/validate';
import { generatePrescriptionPDF } from '@/lib/pdf';
import { MEDS, GLP1_PRODUCT_IDS, SYRINGE_KIT_PRODUCT_ID } from '@/lib/medications';
import { SHIPPING_METHODS } from '@/lib/shipping';
import { prisma, basePrisma, withRetry } from '@/lib/db';
import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { markPrescribed, queueForProvider } from '@/services/refill';
import { providerCompensationService } from '@/services/provider';
import { platformFeeService } from '@/services/billing';
import { buildPatientSearchIndex } from '@/lib/utils/search';

// Medication-specific clinical difference statements for Lifefile
function getClinicalDifferenceStatement(medicationName: string): string | undefined {
  const upperMedName = medicationName.toUpperCase();

  if (upperMedName.includes('TIRZEPATIDE')) {
    return 'Beyond Medical Necessary - This individual patient would benefit from Tirzepatide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }

  if (upperMedName.includes('SEMAGLUTIDE')) {
    return 'Beyond Medical Necessary - This individual patient would benefit from Semaglutide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }

  if (upperMedName.includes('TESTOSTERONE')) {
    return 'Beyond medical necessary - This individual patient will benefit from Testosterone with grapeseed oil due to allergic reactions to commercially available one and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.';
  }

  return undefined;
}

function normalizeDob(input: string): string {
  if (!input) return '';
  if (input.includes('-')) {
    // Already ISO-like
    return input;
  }
  const parts = input.split('/');
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    if (yyyy && mm && dd) {
      return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return input;
}

/**
 * POST /api/prescriptions
 * PROTECTED - Requires provider or admin authentication
 * Creates and submits prescription to Lifefile pharmacy
 */
async function createPrescriptionHandler(req: NextRequest, user: AuthUser) {
  try {
    // Verify user has prescribing permissions
    if (!['provider', 'admin', 'super_admin'].includes(user.role)) {
      logger.security('Unauthorized prescription attempt', { userId: user.id, role: user.role });
      return NextResponse.json(
        { error: 'Not authorized to create prescriptions' },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Use authenticated user's providerId as fallback if not specified in request
    if (!body.providerId && user.providerId) {
      body.providerId = user.providerId;
      logger.info(`[PRESCRIPTIONS] Using authenticated user's providerId: ${user.providerId}`);
    }

    const parsed = prescriptionSchema.safeParse(body);
    if (!parsed.success) {
      logger.error('[PRESCRIPTIONS] Validation failed:', { errors: parsed.error.flatten() });
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
          formErrors: parsed.error.flatten().formErrors,
        },
        { status: 400 }
      );
    }
    const p = parsed.data;

    // Resolve providerId: request body > authenticated user's providerId
    const providerId = p.providerId ?? user.providerId ?? undefined;
    if (!providerId) {
      return NextResponse.json(
        { error: 'Provider selection required. Please select a provider before submitting.' },
        { status: 400 }
      );
    }

    // Queue-for-provider is admin-only (compliance: admin queues, provider approves)
    if (p.queueForProvider && !['admin', 'super_admin'].includes(user.role)) {
      logger.security('Non-admin attempted to queue prescription for provider', {
        userId: user.id,
        role: user.role,
      });
      return NextResponse.json(
        { error: 'Only clinic admins can queue prescriptions for provider review' },
        { status: 403 }
      );
    }

    // Use basePrisma to bypass clinic filtering for provider lookup
    const provider = await basePrisma.provider.findUnique({
      where: { id: providerId },
      include: {
        clinic: true,
      },
    });
    if (!provider) {
      return NextResponse.json(
        { error: 'Invalid providerId. Please ensure a provider profile is configured.' },
        { status: 400 }
      );
    }

    // SECURITY: Verify user can prescribe as this provider
    // Provider users can only prescribe as themselves or providers they're linked to
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
        return NextResponse.json(
          { error: 'Not authorized to prescribe as this provider' },
          { status: 403 }
        );
      }
    }

    // CRITICAL: Use clinicId from user's active clinic for multi-tenant isolation
    // Priority: request clinicId > user's clinicId > provider's clinicId
    const activeClinicId = p.clinicId || user.clinicId || provider.clinicId;

    // ENTERPRISE: Validate provider can prescribe for this clinic
    // Check order: ProviderClinic (primary) > legacy clinicId > UserClinic (fallback)
    if (user.role !== 'super_admin' && activeClinicId) {
      let hasClinicAccess = false;

      // PRIMARY: Check ProviderClinic junction table
      if (basePrisma.providerClinic) {
        try {
          const providerClinicAssignment = await basePrisma.providerClinic.findFirst({
            where: {
              providerId: provider.id,
              clinicId: activeClinicId,
              isActive: true,
            },
            select: { id: true },
          });
          hasClinicAccess = !!providerClinicAssignment;
        } catch (err) {
          // ProviderClinic table may not exist yet (pre-migration)
          logger.debug('[PRESCRIPTIONS] ProviderClinic check skipped - table may not exist', {
            error: err,
          });
        }
      }

      // LEGACY: Check provider's direct clinic assignment
      if (!hasClinicAccess) {
        hasClinicAccess =
          provider.clinicId === null || // Shared provider
          provider.clinicId === activeClinicId; // Direct clinic match
      }

      // FALLBACK: Check if provider's linked user has access via UserClinic
      if (!hasClinicAccess) {
        const providerUser = await basePrisma.user.findFirst({
          where: { providerId: provider.id },
          include: {
            userClinics: {
              where: {
                clinicId: activeClinicId,
                isActive: true,
              },
            },
          },
        });
        hasClinicAccess = !!(providerUser?.userClinics && providerUser.userClinics.length > 0);
      }

      if (!hasClinicAccess) {
        logger.security('Provider not authorized for clinic', {
          userId: user.id,
          providerId: provider.id,
          providerClinicId: provider.clinicId,
          requestedClinicId: activeClinicId,
        });
        return NextResponse.json(
          { error: 'Provider is not authorized to prescribe for this clinic' },
          { status: 403 }
        );
      }
    }

    logger.info(`[PRESCRIPTIONS] User ${user.id} (${user.role}) creating prescription`, {
      requestClinicId: p.clinicId,
      userClinicId: user.clinicId,
      providerClinicId: provider.clinicId,
      activeClinicId,
    });

    // Get clinic-specific Lifefile credentials or fall back to env vars
    let lifefileClient;
    let lifefileCredentials;

    if (activeClinicId) {
      try {
        lifefileCredentials = await getClinicLifefileCredentials(activeClinicId);
        if (lifefileCredentials) {
          lifefileClient = await getClinicLifefileClient(activeClinicId);
          logger.info(
            `[PRESCRIPTIONS] Using clinic ${activeClinicId} Lifefile credentials (practice: ${lifefileCredentials.practiceName})`
          );
        }
      } catch (err: unknown) {
        logger.warn(
          `[PRESCRIPTIONS] Failed to get clinic ${activeClinicId} credentials, falling back to env vars:`,
          { error: err instanceof Error ? err.message : String(err) }
        );
      }
    }

    // Fall back to default client (env vars) if no clinic credentials
    if (!lifefileClient) {
      lifefileClient = lifefile;
      lifefileCredentials = getEnvCredentials();
      logger.info(
        `[PRESCRIPTIONS] Using environment variable Lifefile credentials (no clinic credentials found)`
      );
    }

    if (!lifefileCredentials) {
      return NextResponse.json(
        {
          error:
            'Lifefile not configured. Please contact your administrator to set up pharmacy integration.',
        },
        { status: 400 }
      );
    }

    // If a new signature is provided and provider doesn't have one, save it
    if (p.signatureDataUrl && !provider.signatureDataUrl) {
      await prisma.provider.update({
        where: { id: providerId },
        data: { signatureDataUrl: p.signatureDataUrl },
      });
      logger.debug(
        `[PRESCRIPTIONS] Saved signature for provider ${provider.firstName} ${provider.lastName}`
      );
    }

    let rxsWithMeds: { rx: any; med: any }[];
    try {
      rxsWithMeds = p.rxs.map((rx: any) => {
        const med = MEDS[rx.medicationKey];
        if (!med) {
          throw new Error(`Invalid medicationKey: ${rx.medicationKey}`);
        }
        return { rx, med };
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: errorMessage ?? 'Invalid medication' }, { status: 400 });
    }

    // ── 1-Month Treatment Vial Safeguard ──
    // GLP-1 medications on a 1-month plan should only have 1 vial.
    // Block if >1 vial unless the caller explicitly acknowledges the override.
    const glp1Rxs = rxsWithMeds.filter(({ med }) => GLP1_PRODUCT_IDS.has(med.id));
    const totalGlp1Vials = glp1Rxs.reduce((sum, { rx }) => sum + (Number(rx.quantity) || 1), 0);

    if (totalGlp1Vials > 1 && glp1Rxs.length > 0) {
      // Determine plan duration from explicit field or days supply
      const explicitPlanMonths = (body as any).planMonths ?? (body as any).planDurationMonths;
      const maxDaysSupply = Math.max(
        ...p.rxs.map((rx: any) => Number(rx.daysSupply) || 30)
      );
      // Infer 1-month if explicitly set, or if max days supply <= 30
      const is1Month = explicitPlanMonths != null
        ? Number(explicitPlanMonths) <= 1
        : maxDaysSupply <= 30;

      if (is1Month && !(body as any).overrideVialSafeguard) {
        logger.warn('[PRESCRIPTIONS] 1-month plan with multiple GLP-1 vials blocked', {
          userId: user.id,
          totalGlp1Vials,
          explicitPlanMonths,
          maxDaysSupply,
          medications: glp1Rxs.map(({ med, rx }) => ({
            name: med.name,
            quantity: rx.quantity,
          })),
        });
        return NextResponse.json(
          {
            error: 'A 1-month treatment should only include 1 vial.',
            code: 'VIAL_QUANTITY_SAFEGUARD',
            detail: `This is a 1-month plan but ${totalGlp1Vials} GLP-1 vials were specified. Please reduce to 1 vial, or confirm the override if this is intentional.`,
            recoverable: true,
            totalGlp1Vials,
            planMonths: explicitPlanMonths ?? 1,
          },
          { status: 422 }
        );
      }
    }

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

    const primary = rxsWithMeds[0];

    // Log medications for debugging
    logger.debug(
      `[PRESCRIPTIONS] Processing ${rxsWithMeds.length} medications:`,
      { medications: rxsWithMeds.map(({ med }) => ({
        name: med.name,
        strength: med.strength,
        form: med.form,
      })) }
    );

    const now = new Date();
    const printableDate = now.toLocaleDateString();
    const sentTimeIso = now.toISOString();
    const dateWritten = sentTimeIso.slice(0, 10);
    const messageId = `eonpro-${Date.now()}`;
    const referenceId = `rx-${Date.now()}`;

    const shippingMethodLabel =
      SHIPPING_METHODS.find((method: any) => method.id === p.shippingMethod)?.label ??
      `Service ${p.shippingMethod}`;
    const patientAddressLine2 = p.patient.address2 || undefined;
    const dobIso = normalizeDob(p.patient.dob);

    let pdfBase64: string;
    try {
      pdfBase64 = await generatePrescriptionPDF({
        referenceId,
        date: printableDate,
        // Pass clinic-specific info for PDF header/footer
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
          phone:
            lifefileCredentials.practicePhone ||
            process.env.LIFEFILE_PRACTICE_PHONE ||
            provider.phone ||
            undefined,
        },
        patient: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          phone: p.patient.phone,
          email: p.patient.email,
          dob: dobIso,
          gender:
            p.patient.gender === 'm' ? 'Male' : p.patient.gender === 'f' ? 'Female' : 'Unknown',
          address1: p.patient.address1,
          address2: patientAddressLine2,
          city: p.patient.city,
          state: p.patient.state,
          zip: p.patient.zip,
        },
        // Pass all prescriptions, not just the primary one
        prescriptions: rxsWithMeds.map(({ rx, med }) => ({
          medication: med.name,
          strength: med.strength,
          sig: rx.sig,
          quantity: rx.quantity,
          refills: rx.refills,
          daysSupply: Number(rx.daysSupply) || 30,
        })),
        shipping: {
          methodLabel: shippingMethodLabel,
          addressLine1: p.patient.address1,
          addressLine2: patientAddressLine2,
          city: p.patient.city,
          state: p.patient.state,
          zip: p.patient.zip,
        },
        signatureDataUrl: p.signatureDataUrl ?? provider.signatureDataUrl ?? null,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[PRESCRIPTIONS/POST] PDF generation failed:', err);
      return NextResponse.json(
        { error: 'Failed to generate prescription PDF', detail: errorMessage },
        { status: 500 }
      );
    }

    // CRITICAL: Lifefile pharmacy API only accepts 'm' or 'f' for gender.
    // 'other' or empty values cause a 422 rejection.
    // Map to Lifefile-compatible value or reject with a clear message.
    const lifefileGender = (() => {
      const g = (p.patient.gender || '').toLowerCase().trim();
      if (g === 'm' || g === 'male') return 'm';
      if (g === 'f' || g === 'female') return 'f';
      return null; // Invalid for Lifefile
    })();

    if (!lifefileGender) {
      logger.warn('[PRESCRIPTIONS] Invalid gender for Lifefile API', {
        gender: p.patient.gender,
        patientId: p.patientId,
      });
      return NextResponse.json(
        {
          error: 'Pharmacy requires biological sex (Male or Female) for prescription processing. Please update the patient gender and try again.',
          code: 'INVALID_PHARMACY_GENDER',
          detail: `Gender value "${p.patient.gender}" is not accepted by the pharmacy. Please select Male or Female.`,
        },
        { status: 400 }
      );
    }

    // Pharmacy requires date of birth and complete address. Validate before calling Lifefile
    // so we can return a clear, actionable error instead of a generic API failure.
    const missingForPharmacy: string[] = [];
    if (!p.patient.dob || !String(p.patient.dob).trim()) {
      missingForPharmacy.push('date of birth');
    } else if (!dobIso || dobIso.length < 8) {
      missingForPharmacy.push('valid date of birth');
    }
    const addr1 = (p.patient.address1 ?? '').trim();
    const city = (p.patient.city ?? '').trim();
    const state = (p.patient.state ?? '').trim();
    const zip = (p.patient.zip ?? '').trim();
    if (!addr1) missingForPharmacy.push('street address');
    if (!city) missingForPharmacy.push('city');
    if (!state) missingForPharmacy.push('state');
    if (!zip) missingForPharmacy.push('ZIP code');
    if (missingForPharmacy.length > 0) {
      const list = missingForPharmacy.join(', ');
      logger.warn('[PRESCRIPTIONS] Patient missing required fields for pharmacy', {
        patientId: p.patientId,
        missing: list,
      });
      return NextResponse.json(
        {
          error: 'Patient profile is missing information required by the pharmacy. Please update the patient profile and try again.',
          code: 'MISSING_PATIENT_INFO',
          detail: `Missing: ${list}. Add these in the patient profile (e.g. Profile tab or Edit Patient) before sending the prescription.`,
        },
        { status: 400 }
      );
    }

    const orderPayload: LifefileOrderPayload = {
      message: {
        id: messageId,
        sentTime: sentTimeIso,
      },
      order: {
        general: {
          memo: 'EONPro ePrescribing Platform',
          referenceId,
        },
        prescriber: {
          npi: provider.npi,
          licenseState: provider.licenseState ?? undefined,
          licenseNumber: provider.licenseNumber ?? undefined,
          dea: provider.dea ?? undefined,
          firstName: provider.firstName,
          lastName: provider.lastName,
          phone:
            provider.phone ||
            lifefileCredentials.practicePhone ||
            process.env.LIFEFILE_PRACTICE_PHONE ||
            undefined,
          email: provider.email ?? undefined,
        },
        practice: {
          id: lifefileCredentials.practiceId || process.env.LIFEFILE_PRACTICE_ID,
          name:
            lifefileCredentials.practiceName ||
            process.env.LIFEFILE_PRACTICE_NAME ||
            'APOLLO BASED HEALTH LLC',
        },
        patient: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          dateOfBirth: dobIso,
          gender: lifefileGender,
          address1: p.patient.address1,
          address2: patientAddressLine2,
          city: p.patient.city,
          state: p.patient.state,
          zip: p.patient.zip,
          phoneHome: p.patient.phone,
          email: p.patient.email,
        },
        shipping: {
          recipientType: 'patient',
          recipientFirstName: p.patient.firstName,
          recipientLastName: p.patient.lastName,
          recipientPhone: p.patient.phone,
          recipientEmail: p.patient.email ?? undefined,
          addressLine1: p.patient.address1,
          addressLine2: patientAddressLine2,
          city: p.patient.city,
          state: p.patient.state,
          zipCode: p.patient.zip,
          service: p.shippingMethod,
        },
        billing: {
          payorType: 'pat',
        },
        rxs: rxsWithMeds.map(({ rx, med }, index) => {
          const rxData = {
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
          };

          // Log each prescription being sent
          logger.debug(`[PRESCRIPTIONS] Rx #${index + 1}:`, {
            drugName: rxData.drugName,
            drugStrength: rxData.drugStrength,
            lfProductID: rxData.lfProductID,
          });

          return rxData;
        }),
        document: {
          pdfBase64,
        },
      },
    };

    // CRITICAL: Must have clinicId for data integrity
    if (!activeClinicId) {
      logger.error('[PRESCRIPTIONS] Cannot create patient without clinic context', {
        userId: user.id,
        patientEmail: p.patient.email,
      });
      return NextResponse.json(
        { error: 'Clinic context required to create patient' },
        { status: 400 }
      );
    }

    try {
      // ENTERPRISE: Atomic transaction for prescription creation
      // This ensures all records are created together or none at all
      // Wrapped with retry for connection pool resilience
      type TransactionResult = {
        order: Order & { patient?: Patient | null };
        patient: Patient;
        isNew: boolean;
      };

      const transactionResult = await withRetry<TransactionResult>(
        () =>
          (prisma.$transaction(
            async (tx) => {
              // Check for duplicate submission (idempotency)
              const existingOrder = await tx.order.findFirst({
                where: {
                  messageId,
                  clinicId: activeClinicId,
                },
                include: { patient: true },
              });

              if (existingOrder) {
                logger.info('[PRESCRIPTIONS] Duplicate submission detected', {
                  messageId,
                  existingOrderId: existingOrder.id,
                });
                return {
                  order: existingOrder,
                  patient: existingOrder.patient,
                  isNew: false,
                };
              }

              // Find or create patient within transaction
              let patientRecord = null;
              let patientClinicId = activeClinicId; // Default to active clinic

              // CRITICAL FIX: If patientId is provided, use the existing patient directly
              // This prevents duplicate patient creation across clinics when prescribing
              // for an existing patient from their profile page
              // IMPORTANT: Use tx (not basePrisma) inside transaction - basePrisma would
              // request a separate connection, causing pool exhaustion with connection_limit=1
              if (p.patientId) {
                patientRecord = await tx.patient.findUnique({
                  where: { id: p.patientId },
                });

                if (patientRecord) {
                  // Use the patient's actual clinic for the order
                  patientClinicId = patientRecord.clinicId;
                  logger.info('[PRESCRIPTIONS] Using existing patient by ID', {
                    patientId: patientRecord.id,
                    patientClinicId: patientRecord.clinicId,
                    requestedClinicId: activeClinicId,
                  });

                  // SECURITY: Verify provider can prescribe for this patient's clinic
                  // Super admins can prescribe for any clinic
                  if (user.role !== 'super_admin') {
                    let canPrescribeForPatientClinic = false;

                    // Check ProviderClinic junction table (use tx to avoid connection pool deadlock)
                    if (tx.providerClinic) {
                      try {
                        const assignment = await tx.providerClinic.findFirst({
                          where: {
                            providerId: provider.id,
                            clinicId: patientRecord.clinicId,
                            isActive: true,
                          },
                        });
                        canPrescribeForPatientClinic = !!assignment;
                      } catch {
                        // Table may not exist
                      }
                    }

                    // Fallback: check provider's direct clinic assignment or shared status
                    if (!canPrescribeForPatientClinic) {
                      canPrescribeForPatientClinic =
                        provider.clinicId === null || // Shared provider
                        provider.clinicId === patientRecord.clinicId;
                    }

                    if (!canPrescribeForPatientClinic) {
                      logger.security('Provider not authorized for patient clinic', {
                        userId: user.id,
                        providerId: provider.id,
                        providerClinicId: provider.clinicId,
                        patientClinicId: patientRecord.clinicId,
                      });
                      throw new Error(
                        'Provider is not authorized to prescribe for patients in this clinic'
                      );
                    }
                  }
                } else {
                  logger.warn('[PRESCRIPTIONS] Patient ID provided but not found', {
                    patientId: p.patientId,
                  });
                  // Will fall through to name-based lookup below
                }
              }

              // Fall back to name-based lookup if no patient found by ID
              if (!patientRecord) {
                patientRecord = await tx.patient.findFirst({
                  where: {
                    firstName: p.patient.firstName,
                    lastName: p.patient.lastName,
                    dob: p.patient.dob,
                    clinicId: activeClinicId,
                  },
                });
              }

              // Create new patient if not found
              if (!patientRecord) {
                const searchIndex = buildPatientSearchIndex({
                  firstName: p.patient.firstName,
                  lastName: p.patient.lastName,
                  email: p.patient.email,
                  phone: p.patient.phone,
                });
                patientRecord = await tx.patient.create({
                  data: {
                    firstName: p.patient.firstName,
                    lastName: p.patient.lastName,
                    dob: p.patient.dob,
                    gender: p.patient.gender,
                    phone: p.patient.phone,
                    email: p.patient.email,
                    address1: p.patient.address1,
                    address2: patientAddressLine2 ?? null,
                    city: p.patient.city,
                    state: p.patient.state,
                    zip: p.patient.zip,
                    clinicId: activeClinicId,
                    searchIndex,
                  },
                });
                patientClinicId = activeClinicId;
                logger.info('[PRESCRIPTIONS] New patient created in transaction', {
                  patientId: patientRecord.id,
                  clinicId: activeClinicId,
                });
              }

              // Create order within transaction
              // CRITICAL: Use patientClinicId to ensure order is in same clinic as patient
              // When queueForProvider: status = queued_for_provider, no Lifefile call (provider approves later)
              const orderStatus = p.queueForProvider ? 'queued_for_provider' : 'PENDING';
              const now = new Date();
              const order = await tx.order.create({
                data: {
                  messageId,
                  referenceId,
                  patientId: patientRecord.id,
                  providerId: providerId,
                  clinicId: patientClinicId, // Use patient's clinic, not activeClinicId
                  shippingMethod: p.shippingMethod,
                  primaryMedName: primary.med.name,
                  primaryMedStrength: primary.med.strength,
                  primaryMedForm: primary.med.formLabel ?? primary.med.form,
                  status: orderStatus,
                  requestJson: JSON.stringify(orderPayload),
                  ...(p.queueForProvider
                    ? {
                        queuedForProviderAt: now,
                        queuedByUserId: user.id,
                      }
                    : {}),
                },
              });

              // Create Rx items within transaction
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

              logger.info('[PRESCRIPTIONS] Transaction completed successfully', {
                orderId: order.id,
                patientId: patientRecord.id,
                rxCount: rxsWithMeds.length,
              });

              return {
                order,
                patient: patientRecord,
                isNew: true,
              };
            },
            {
              isolationLevel: 'Serializable',
              timeout: 30000,
            }
          )) as unknown as Promise<TransactionResult>,
        {
          maxRetries: 3,
          initialDelayMs: 200,
          maxDelayMs: 2000,
          // Retry on connection pool and timeout errors
          retryOn: (error) => {
            const msg = error.message.toLowerCase();
            return msg.includes('connection') || msg.includes('timeout') || msg.includes('pool');
          },
        }
      );

      // If duplicate, return existing order info
      if (!transactionResult.isNew) {
        logger.info('[PRESCRIPTIONS] Returning existing order for duplicate submission', {
          orderId: transactionResult.order.id,
        });
        return NextResponse.json({
          success: true,
          order: transactionResult.order,
          duplicate: true,
          message: 'Duplicate submission - returning existing order',
        });
      }

      const { order, patient: patientRecord } = transactionResult;

      // When admin chose "Queue for provider", do not call Lifefile; record audit and return
      if (p.queueForProvider) {
        try {
          await auditLog(req, {
            userId: user.id,
            userEmail: user.email,
            userRole: user.role,
            clinicId: (order as any).clinicId ?? undefined,
            eventType: AuditEventType.PRESCRIPTION_QUEUED,
            resourceType: 'Order',
            resourceId: String(order.id),
            patientId: patientRecord.id,
            action: 'prescription_queued_for_provider',
            outcome: 'SUCCESS',
            metadata: { orderId: order.id, providerId: providerId },
          });
        } catch (auditErr) {
          logger.error('[PRESCRIPTIONS] Audit log failed for queued prescription', {
            orderId: order.id,
            error: auditErr instanceof Error ? auditErr.message : 'Unknown',
          });
        }
        return NextResponse.json({
          success: true,
          order,
          patientId: patientRecord.id,
          queuedForProvider: true,
          message:
            'Prescription queued for provider review. A provider can approve and send it to the pharmacy from the prescription queue.',
        });
      }

      // ENTERPRISE: External API call AFTER transaction commits
      // This ensures DB state is consistent even if Lifefile fails
      let orderResponse;
      try {
        orderResponse = await lifefileClient.createFullOrder(orderPayload);
      } catch (lifefileError: unknown) {
        // Mark order as error but don't rollback DB - we have the record
        const errorMessage =
          lifefileError instanceof Error ? lifefileError.message : 'Unknown Lifefile error';
        logger.error('[PRESCRIPTIONS] Lifefile API call failed after DB commit', {
          orderId: order.id,
          error: errorMessage,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'error',
            errorMessage: `Lifefile submission failed: ${errorMessage}`,
          },
        });

        return NextResponse.json(
          {
            error: 'The pharmacy could not accept this order. Check the reason below and update the patient profile if needed, then try again.',
            code: 'LIFEFILE_SUBMISSION_FAILED',
            detail: errorMessage,
            orderId: order.id,
            recoverable: true,
          },
          { status: 502 }
        );
      }
      // Lifefile returns orderId nested: { data: { orderId: 100719360 } }
      // Also check top-level for forward compatibility
      const lifefileOrderId =
        orderResponse?.data?.orderId ?? orderResponse?.orderId ?? null;

      logger.info('[PRESCRIPTIONS] Lifefile response', {
        orderId: order.id,
        lifefileOrderId,
        responseType: orderResponse?.type,
      });

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          lifefileOrderId: lifefileOrderId != null ? String(lifefileOrderId) : undefined,
          status: orderResponse?.status ?? 'sent',
          responseJson: JSON.stringify(orderResponse),
        },
      });

      // CRITICAL: Auto-mark invoice as processed after successful Lifefile submission.
      // This prevents the prescription from staying in the queue when the frontend's
      // separate PATCH call fails (network issue, timeout, etc.)
      if (p.invoiceId) {
        try {
          await prisma.invoice.update({
            where: { id: p.invoiceId },
            data: {
              prescriptionProcessed: true,
              prescriptionProcessedAt: new Date(),
              prescriptionProcessedBy: user.providerId ?? null,
            },
          });
          logger.info('[PRESCRIPTIONS] Invoice auto-marked as processed', {
            invoiceId: p.invoiceId,
            orderId: order.id,
          });
        } catch (invoiceErr) {
          // Non-fatal: prescription was sent successfully, invoice marking is secondary
          logger.error('[PRESCRIPTIONS] Failed to auto-mark invoice as processed', {
            invoiceId: p.invoiceId,
            orderId: order.id,
            error: invoiceErr instanceof Error ? invoiceErr.message : 'Unknown error',
          });
        }
      }

      // Handle refill queue if this prescription is from a refill request
      let refillResult = null;
      if (p.refillId) {
        try {
          // Get provider ID from the user
          let providerId: number | null = null;
          if (user.providerId) {
            providerId = user.providerId;
          } else {
            const userData = await basePrisma.user.findUnique({
              where: { id: user.id },
              select: { providerId: true },
            });
            providerId = userData?.providerId || null;
          }

          refillResult = await markPrescribed(
            p.refillId,
            providerId || user.id, // Use provider ID or user ID as fallback
            order.id
          );

          logger.info('[PRESCRIPTIONS] Refill marked as prescribed', {
            refillId: p.refillId,
            orderId: order.id,
            nextRefillId: refillResult.next?.id,
          });
        } catch (refillError) {
          // Log but don't fail the prescription - refill tracking is secondary
          logger.error('[PRESCRIPTIONS] Failed to update refill queue', {
            refillId: p.refillId,
            error: refillError instanceof Error ? refillError.message : 'Unknown error',
          });
        }
      }

      // Also check if there's an invoice with a linked refill
      if (p.invoiceId && !p.refillId) {
        try {
          // Find any refill linked to this invoice
          const linkedRefill = await prisma.refillQueue.findFirst({
            where: {
              invoiceId: p.invoiceId,
              status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
            },
          });

          if (linkedRefill) {
            let providerId: number | null = null;
            if (user.providerId) {
              providerId = user.providerId;
            } else {
              const userData = await basePrisma.user.findUnique({
                where: { id: user.id },
                select: { providerId: true },
              });
              providerId = userData?.providerId || null;
            }

            refillResult = await markPrescribed(linkedRefill.id, providerId || user.id, order.id);

            logger.info('[PRESCRIPTIONS] Linked refill marked as prescribed', {
              refillId: linkedRefill.id,
              invoiceId: p.invoiceId,
              orderId: order.id,
            });
          }
        } catch (refillError) {
          logger.error('[PRESCRIPTIONS] Failed to update linked refill', {
            invoiceId: p.invoiceId,
            error: refillError instanceof Error ? refillError.message : 'Unknown error',
          });
        }
      }

      // ENTERPRISE: Record compensation event for the provider
      // This is tracked only if compensation is enabled for the clinic
      try {
        const compensationEvent = await providerCompensationService.recordPrescription(
          updated.id,
          providerId,
          {
            patientId: patientRecord.id,
            patientState: p.patient.state,
            medicationName: primary.med.name,
            invoiceId: p.invoiceId,
          }
        );

        if (compensationEvent) {
          logger.info('[PRESCRIPTIONS] Compensation event recorded', {
            orderId: updated.id,
            eventId: compensationEvent.id,
            providerId: providerId,
            amountCents: compensationEvent.amountCents,
          });
        }
      } catch (compError) {
        // Don't fail the prescription if compensation recording fails
        logger.error('[PRESCRIPTIONS] Failed to record compensation event', {
          orderId: updated.id,
          providerId: providerId,
          error: compError instanceof Error ? compError.message : 'Unknown error',
        });
      }

      // PLATFORM BILLING: Record platform fee for the clinic
      // Fee type (PRESCRIPTION vs TRANSMISSION) depends on provider type (EONPRO vs clinic provider)
      // Respects prescription cycle (no double-charging within configured period, e.g., 90 days)
      try {
        const platformFeeEvent = await platformFeeService.recordPrescriptionFee(
          updated.id,
          providerId
        );

        if (platformFeeEvent) {
          logger.info('[PRESCRIPTIONS] Platform fee recorded', {
            orderId: updated.id,
            eventId: platformFeeEvent.id,
            feeType: platformFeeEvent.feeType,
            amountCents: platformFeeEvent.amountCents,
          });
        }
      } catch (feeError) {
        // Don't fail the prescription if fee recording fails
        logger.error('[PRESCRIPTIONS] Failed to record platform fee', {
          orderId: updated.id,
          providerId: providerId,
          error: feeError instanceof Error ? feeError.message : 'Unknown error',
        });
      }

      // Auto-send portal invite on first order (always-on, all brands)
      try {
        const { triggerPortalInviteOnPayment } = await import('@/lib/portal-invite/service');
        await triggerPortalInviteOnPayment(patientRecord.id);
      } catch (inviteErr) {
        logger.warn('[PRESCRIPTIONS] Portal invite on order failed (non-fatal)', {
          patientId: patientRecord.id,
          error: inviteErr instanceof Error ? inviteErr.message : 'Unknown',
        });
      }

      return NextResponse.json({
        success: true,
        order: updated,
        lifefile: orderResponse,
        refill: refillResult
          ? {
              currentId: refillResult.current.id,
              nextId: refillResult.next?.id,
              nextRefillDate: refillResult.next?.nextRefillDate,
            }
          : null,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('[PRESCRIPTIONS/POST] Lifefile createFullOrder failed:', err);
      try {
        await prisma.order.updateMany({
          where: { messageId },
          data: {
            status: 'error',
            errorMessage: errorMessage ?? 'Unknown Lifefile error',
          },
        });
      } catch (dbErr: any) {
        logger.error('Failed to update order error state:', { value: dbErr });
      }
      return NextResponse.json(
        {
          error: 'The pharmacy could not accept this order. Check the reason below and update the patient profile if needed, then try again.',
          code: 'LIFEFILE_SUBMISSION_FAILED',
          detail: errorMessage,
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[PRESCRIPTIONS/POST] Unexpected error:', err);
    // P2024 / connection pool exhaustion: return 503 so client can retry (matches login, messages)
    const isPoolExhausted =
      err?.code === 'P2024' ||
      (typeof errorMessage === 'string' &&
        (errorMessage.toLowerCase().includes('connection pool') ||
          errorMessage.includes('pool timeout')));
    if (isPoolExhausted) {
      return NextResponse.json(
        { error: 'Service temporarily busy. Please try again in a moment.', detail: errorMessage },
        { status: 503, headers: { 'Retry-After': '15' } }
      );
    }
    return NextResponse.json(
      { error: 'Unexpected server error', detail: errorMessage ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

// Export with authentication - requires provider, admin, or super_admin role
export const POST = withClinicalAuth(createPrescriptionHandler);
