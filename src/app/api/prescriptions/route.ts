import lifefile, { LifefileOrderPayload } from "@/lib/lifefile";
import { prescriptionSchema } from "@/lib/validate";
import { generatePrescriptionPDF } from "@/lib/pdf";
import { MEDS } from "@/lib/medications";
import { SHIPPING_METHODS } from "@/lib/shipping";
import { prisma } from "@/lib/db";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = prescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(parsed.error, { status: 400 });
    }
    const p = parsed.data;

    const provider = await prisma.provider.findUnique({
      where: { id: p.providerId },
    });
    if (!provider) {
      return Response.json({ error: "Invalid providerId" }, { status: 400 });
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
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
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
        provider: {
          name: `${provider.firstName} ${provider.lastName}`,
          npi: provider.npi,
          dea: provider.dea,
          licenseNumber: provider.licenseNumber,
          address1: process.env.LIFEFILE_PRACTICE_ADDRESS,
          phone: process.env.LIFEFILE_PRACTICE_PHONE ?? provider.phone ?? undefined,
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
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PRESCRIPTIONS/POST] PDF generation failed:", err);
      return Response.json(
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
          phone: provider.phone ?? process.env.LIFEFILE_PRACTICE_PHONE ?? undefined,
          email: provider.email ?? undefined,
        },
        practice: {
          id: process.env.LIFEFILE_PRACTICE_ID,
          name: process.env.LIFEFILE_PRACTICE_NAME ?? "APOLLO BASED HEALTH LLC",
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
      let patientRecord = await // @ts-ignore
    prisma.patient.findFirst({
        where: {
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          dob: p.patient.dob,
        },
      });

      if (!patientRecord) {
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
          },
        });
      }

      const order = await prisma.order.create({
        data: {
          messageId,
          referenceId,
          patientId: patientRecord.id,
          providerId: p.providerId,
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

      const orderResponse = await lifefile.createFullOrder(orderPayload);
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

      return Response.json({
        success: true,
        order: updated,
        lifefile: orderResponse,
      });
    } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // @ts-ignore
   
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
      return Response.json(
        { error: "Failed to submit order to Lifefile", detail: errorMessage },
        { status: 502 }
      );
    }
  } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PRESCRIPTIONS/POST] Unexpected error:", err);
    return Response.json(
      { error: "Unexpected server error", detail: errorMessage ?? "Unknown error" },
      { status: 500 }
    );
  }
}
