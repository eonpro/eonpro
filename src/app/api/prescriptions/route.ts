import lifefile, { LifefileOrderPayload, getEnvCredentials } from "@/lib/lifefile";
import { getClinicLifefileClient, getClinicLifefileCredentials } from "@/lib/clinic-lifefile";
import { prescriptionSchema } from "@/lib/validate";
import { generatePrescriptionPDF } from "@/lib/pdf";
import { MEDS } from "@/lib/medications";
import { SHIPPING_METHODS } from "@/lib/shipping";
import { prisma, basePrisma } from "@/lib/db";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { markPrescribed, queueForProvider } from '@/services/refill';
import { providerCompensationService } from '@/services/provider';

// Medication-specific clinical difference statements for Lifefile
function getClinicalDifferenceStatement(medicationName: string): string | undefined {
  const upperMedName = medicationName.toUpperCase();

  if (upperMedName.includes("TIRZEPATIDE")) {
    return "Beyond Medical Necessary - This individual patient would benefit from Tirzepatide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
  }

  if (upperMedName.includes("SEMAGLUTIDE")) {
    return "Beyond Medical Necessary - This individual patient would benefit from Semaglutide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
  }

  if (upperMedName.includes("TESTOSTERONE")) {
    return "Beyond medical necessary - This individual patient will benefit from Testosterone with grapeseed oil due to allergic reactions to commercially available one and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance. By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.";
  }

  return undefined;
}

function normalizeDob(input: string): string {
  if (!input) return "";
  if (input.includes("-")) {
    // Already ISO-like
    return input;
  }
  const parts = input.split("/");
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    if (yyyy && mm && dd) {
      return `${yyyy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
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
          formErrors: parsed.error.flatten().formErrors
        },
        { status: 400 }
      );
    }
    const p = parsed.data;

    // Use basePrisma to bypass clinic filtering for provider lookup
    const provider = await basePrisma.provider.findUnique({
      where: { id: p.providerId },
      include: {
        clinic: true,
      },
    });
    if (!provider) {
      return NextResponse.json({ error: "Invalid providerId. Please ensure a provider profile is configured." }, { status: 400 });
    }

    // SECURITY: Verify user can prescribe as this provider
    // Provider users can only prescribe as themselves or providers they're linked to
    if (user.role === 'provider') {
      const userData = await basePrisma.user.findUnique({
        where: { id: user.id },
        select: { providerId: true, email: true }
      });

      const canPrescribe =
        userData?.providerId === provider.id ||
        userData?.email?.toLowerCase() === provider.email?.toLowerCase();

      if (!canPrescribe) {
        logger.security('Provider attempted to prescribe as different provider', {
          userId: user.id,
          userProviderId: userData?.providerId,
          requestedProviderId: provider.id
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
          logger.debug('[PRESCRIPTIONS] ProviderClinic check skipped - table may not exist', { error: err });
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
                isActive: true
              }
            }
          }
        });
        hasClinicAccess = !!(providerUser?.userClinics && providerUser.userClinics.length > 0);
      }

      if (!hasClinicAccess) {
        logger.security('Provider not authorized for clinic', {
          userId: user.id,
          providerId: provider.id,
          providerClinicId: provider.clinicId,
          requestedClinicId: activeClinicId
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
      activeClinicId
    });

    // Get clinic-specific Lifefile credentials or fall back to env vars
    let lifefileClient;
    let lifefileCredentials;

    if (activeClinicId) {
      try {
        lifefileCredentials = await getClinicLifefileCredentials(activeClinicId);
        if (lifefileCredentials) {
          lifefileClient = await getClinicLifefileClient(activeClinicId);
          logger.info(`[PRESCRIPTIONS] Using clinic ${activeClinicId} Lifefile credentials (practice: ${lifefileCredentials.practiceName})`);
        }
      } catch (err: unknown) {
        logger.warn(`[PRESCRIPTIONS] Failed to get clinic ${activeClinicId} credentials, falling back to env vars:`, { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Fall back to default client (env vars) if no clinic credentials
    if (!lifefileClient) {
      lifefileClient = lifefile;
      lifefileCredentials = getEnvCredentials();
      logger.info(`[PRESCRIPTIONS] Using environment variable Lifefile credentials (no clinic credentials found)`);
    }

    if (!lifefileCredentials) {
      return NextResponse.json(
        { error: "Lifefile not configured. Please contact your administrator to set up pharmacy integration." },
        { status: 400 }
      );
    }

    // If a new signature is provided and provider doesn't have one, save it
    if (p.signatureDataUrl && !provider.signatureDataUrl) {
      await prisma.provider.update({
        where: { id: p.providerId },
        data: { signatureDataUrl: p.signatureDataUrl },
      });
      logger.debug(`[PRESCRIPTIONS] Saved signature for provider ${provider.firstName} ${provider.lastName}`);
    }

    let rxsWithMeds;
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
      return NextResponse.json(
        { error: errorMessage ?? "Invalid medication" },
        { status: 400 }
      );
    }

    const primary = rxsWithMeds[0];

    // Log medications for debugging
    logger.debug(`[PRESCRIPTIONS] Processing ${rxsWithMeds.length} medications:`, rxsWithMeds.map(({ med }) => ({
      name: med.name,
      strength: med.strength,
      form: med.form
    })));

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
          phone: lifefileCredentials.practicePhone || process.env.LIFEFILE_PRACTICE_PHONE || provider.phone || undefined,
        },
        patient: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          phone: p.patient.phone,
          email: p.patient.email,
          dob: dobIso,
          gender:
            p.patient.gender === "m"
              ? "Male"
              : p.patient.gender === "f"
              ? "Female"
              : "Unknown",
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
          daysSupply: 30,
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
      logger.error("[PRESCRIPTIONS/POST] PDF generation failed:", err);
      return NextResponse.json(
        { error: "Failed to generate prescription PDF", detail: errorMessage },
        { status: 500 }
      );
    }

    const orderPayload: LifefileOrderPayload = {
      message: {
        id: messageId,
        sentTime: sentTimeIso,
      },
      order: {
        general: {
          memo: "EONPro ePrescribing Platform",
          referenceId,
        },
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
          name: lifefileCredentials.practiceName || process.env.LIFEFILE_PRACTICE_NAME || "APOLLO BASED HEALTH LLC",
        },
        patient: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          dateOfBirth: dobIso,
          gender: p.patient.gender,
          address1: p.patient.address1,
          address2: patientAddressLine2,
          city: p.patient.city,
          state: p.patient.state,
          zip: p.patient.zip,
          phoneHome: p.patient.phone,
          email: p.patient.email,
        },
        shipping: {
          recipientType: "patient",
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
          payorType: "pat",
        },
        rxs: rxsWithMeds.map(({ rx, med }, index) => {
          const rxData = {
            rxType: "new" as const,
            drugName: med.name,
            drugStrength: med.strength,
            drugForm: med.formLabel ?? med.form,
            lfProductID: med.id,
            quantity: rx.quantity,
            quantityUnits: "EA",
            directions: rx.sig,
            refills: Number(rx.refills ?? "0"),
            dateWritten,
            daysSupply: 30,
            clinicalDifferenceStatement: getClinicalDifferenceStatement(med.name),
          };

          // Log each prescription being sent
          logger.debug(`[PRESCRIPTIONS] Rx #${index + 1}:`, {
            drugName: rxData.drugName,
            drugStrength: rxData.drugStrength,
            lfProductID: rxData.lfProductID
          });

          return rxData;
        }),
        document: {
          pdfBase64,
        },
      },
    };

    try {
      let patientRecord = await prisma.patient.findFirst({
        where: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          dob: p.patient.dob,
        },
      });

      if (!patientRecord) {
        // CRITICAL: Must have clinicId for data integrity
        if (!activeClinicId) {
          logger.error('[PRESCRIPTIONS] Cannot create patient without clinic context', {
            userId: user.id,
            patientEmail: p.patient.email
          });
          return NextResponse.json(
            { error: 'Clinic context required to create patient' },
            { status: 400 }
          );
        }

        patientRecord = await prisma.patient.create({
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
            clinicId: activeClinicId, // Explicit clinic assignment
          },
        });
      }

      const order = await prisma.order.create({
        data: {
          messageId,
          referenceId,
          patientId: patientRecord.id,
          providerId: p.providerId,
          clinicId: activeClinicId, // ENTERPRISE: Explicit clinic assignment for multi-tenant isolation
          shippingMethod: p.shippingMethod,
          primaryMedName: primary.med.name,
          primaryMedStrength: primary.med.strength,
          primaryMedForm: primary.med.formLabel ?? primary.med.form,
          status: "PENDING",
          requestJson: JSON.stringify(orderPayload),
        },
      });

      await prisma.rx.createMany({
        data: rxsWithMeds.map(({ rx, med }) => ({
          orderId: order.id,
          medicationKey: rx.medicationKey,
          medName: med.name,
          strength: med.strength,
          form: med.form,
          quantity: rx.quantity,
          refills: rx.refills,
          sig: rx.sig,
        })),
      });

      const orderResponse = await lifefileClient.createFullOrder(orderPayload);
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          lifefileOrderId: orderResponse.orderId
            ? String(orderResponse.orderId)
            : undefined,
          status: orderResponse.status ?? "sent",
          responseJson: JSON.stringify(orderResponse),
        },
      });

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

            refillResult = await markPrescribed(
              linkedRefill.id,
              providerId || user.id,
              order.id
            );

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
          p.providerId,
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
            providerId: p.providerId,
            amountCents: compensationEvent.amountCents,
          });
        }
      } catch (compError) {
        // Don't fail the prescription if compensation recording fails
        logger.error('[PRESCRIPTIONS] Failed to record compensation event', {
          orderId: updated.id,
          providerId: p.providerId,
          error: compError instanceof Error ? compError.message : 'Unknown error',
        });
      }

      return NextResponse.json({
        success: true,
        order: updated,
        lifefile: orderResponse,
        refill: refillResult ? {
          currentId: refillResult.current.id,
          nextId: refillResult.next?.id,
          nextRefillDate: refillResult.next?.nextRefillDate,
        } : null,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[PRESCRIPTIONS/POST] Lifefile createFullOrder failed:", err);
      try {
        await prisma.order.updateMany({
          where: { messageId },
          data: {
            status: "error",
            errorMessage: errorMessage ?? "Unknown Lifefile error",
          },
        });
      } catch (dbErr: any) {
        logger.error("Failed to update order error state:", { value: dbErr });
      }
      return NextResponse.json(
        { error: "Failed to submit order to Lifefile", detail: errorMessage },
        { status: 502 }
      );
    }
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PRESCRIPTIONS/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error", detail: errorMessage ?? "Unknown error" },
      { status: 500 }
    );
  }
}

// Export with authentication - requires provider, admin, or super_admin role
export const POST = withClinicalAuth(createPrescriptionHandler);
