import { prisma } from "@/lib/db";
import { patientSchema } from "@/lib/validate";
import { logger } from '@/lib/logger';
import { encryptPatientPHI, decryptPatientPHI } from '@/lib/security/phi-encryption';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

type Params = {
  params: Promise<{ id: string }>;
};

function diffPatient(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
) {
  const diff: Record<string, { before: any; after: any }> = {};
  fields.forEach((field: any) => {
    if (before[field] !== after[field]) {
      diff[field] = { before: before[field], after: after[field] };
    }
  });
  return diff;
}

const getPatientHandler = withAuthParams(async (_request, user, { params }: Params) => {
  try {
    const resolvedParams = await params;
    const id = Number(resolvedParams.id);
    if (Number.isNaN(id)) {
      return Response.json({ error: "Invalid patient id" }, { status: 400 });
    }
    
    const patient = await prisma.patient.findUnique({
      where: { id },
    });
    
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }
    
    // Check authorization: patients can only see their own record
    if (user.role === 'patient' && user.patientId !== patient.id) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }
    
    // Decrypt PHI fields for authorized users - with error handling
    let decryptedPatient;
    try {
      decryptedPatient = decryptPatientPHI(patient, ['email', 'phone', 'dob']);
    } catch (decryptError) {
      // If decryption fails, return patient data without decryption
      logger.warn('Failed to decrypt patient PHI, returning raw data', { patientId: id });
      decryptedPatient = patient;
    }
    
    return Response.json({ patient: decryptedPatient });
  } catch (error: any) {
    logger.error('[GET /api/patients/:id] Error', { error: error.message, stack: error.stack });
    return Response.json({ error: 'Failed to fetch patient', details: error.message }, { status: 500 });
  }
}, { roles: ['super_admin', 'admin', 'provider', 'patient', 'staff'] });

// Export directly - rate limiting breaks context passing for dynamic routes
export const GET = getPatientHandler;

const updatePatientHandler = withAuthParams(async (request, user, { params }: Params) => {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid patient id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = patientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(parsed.error, { status: 400 });
  }

  try {
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }
    
    // Check authorization
    if (user.role === 'patient' && user.patientId !== existing.id) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }
    
    // Decrypt existing data for comparison
    const existingDecrypted = decryptPatientPHI(existing, ['email', 'phone', 'dob']);
    
    // Encrypt new PHI data before storing
    const encryptedData = encryptPatientPHI(parsed.data, ['email', 'phone', 'dob']);

    const patient = await prisma.patient.update({
      where: { id },
      data: encryptedData,
    });

    // Use decrypted values for diff to show actual changes
    const patientDecrypted = decryptPatientPHI(patient, ['email', 'phone', 'dob']);
    const changeSet = diffPatient(existingDecrypted, patientDecrypted, [
      "firstName",
      "lastName",
      "dob",
      "gender",
      "phone",
      "email",
      "address1",
      "address2",
      "city",
      "state",
      "zip",
      "notes",
      "tags",
    ]);

    if (Object.keys(changeSet).length > 0) {
      await prisma.patientAudit.create({
        data: {
          patientId: id,
          actorEmail: user.email,
          action: "update",
          diff: changeSet,
        },
      });
    }
    
    // Return decrypted patient data
    const decryptedPatient = decryptPatientPHI(patient, ['email', 'phone', 'dob']);
    return Response.json({ patient: decryptedPatient });
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PATIENTS/PATCH] Failed to update patient", err);
    return Response.json(
      { error: errorMessage ?? "Failed to update patient" },
      { status: 400 }
    );
  }
}, { roles: ['super_admin', 'admin', 'provider', 'patient', 'staff'] });

// Export directly - rate limiting breaks context passing for dynamic routes
export const PATCH = updatePatientHandler;

const deletePatientHandler = withAuthParams(async (_request, user, { params }: Params) => {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid patient id" }, { status: 400 });
  }

  try {
    const existing = await prisma.patient.findUnique({ 
      where: { id },
      include: {
        _count: {
          select: {
            orders: true,
            documents: true,
            soapNotes: true,
            appointments: true,
          }
        }
      }
    });
    
    if (!existing) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }
    
    // Only super_admin and admin can delete patients
    if (!['super_admin', 'admin'].includes(user.role)) {
      return Response.json({ error: "Only administrators can delete patients" }, { status: 403 });
    }

    // Log the deletion for audit purposes
    await prisma.patientAudit.create({
      data: {
        patientId: id,
        actorEmail: user.email,
        action: "delete",
        diff: {
          deleted: true,
          firstName: existing.firstName,
          lastName: existing.lastName,
          relatedData: existing._count,
        },
      },
    });

    // Delete related records in order (to respect foreign key constraints)
    // Delete in batches to handle large datasets
    
    // Delete medication reminders
    await prisma.patientMedicationReminder.deleteMany({ where: { patientId: id } });
    
    // Delete weight logs
    await prisma.patientWeightLog.deleteMany({ where: { patientId: id } });
    
    // Delete intake form responses and submissions
    const submissions = await prisma.intakeFormSubmission.findMany({ where: { patientId: id } });
    for (const submission of submissions) {
      await prisma.intakeFormResponse.deleteMany({ where: { submissionId: submission.id } });
    }
    await prisma.intakeFormSubmission.deleteMany({ where: { patientId: id } });
    
    // Delete SOAP notes
    await prisma.sOAPNote.deleteMany({ where: { patientId: id } });
    
    // Delete appointments
    await prisma.appointment.deleteMany({ where: { patientId: id } });
    
    // Delete documents
    await prisma.patientDocument.deleteMany({ where: { patientId: id } });
    
    // Delete subscriptions
    await prisma.subscription.deleteMany({ where: { patientId: id } });
    
    // Delete payment methods
    await prisma.paymentMethod.deleteMany({ where: { patientId: id } });
    
    // Delete order events and rxs, then orders
    const orders = await prisma.order.findMany({ where: { patientId: id } });
    for (const order of orders) {
      await prisma.orderEvent.deleteMany({ where: { orderId: order.id } });
      await prisma.rx.deleteMany({ where: { orderId: order.id } });
    }
    await prisma.order.deleteMany({ where: { patientId: id } });
    
    // Delete audit entries (keep for compliance, but reference will be broken)
    // await prisma.patientAudit.deleteMany({ where: { patientId: id } });
    
    // Delete tickets
    await prisma.ticket.deleteMany({ where: { patientId: id } });
    
    // Delete referral tracking
    await prisma.referralTracking.deleteMany({ where: { patientId: id } });
    
    // Finally, delete the patient
    await prisma.patient.delete({ where: { id } });

    logger.info(`[DELETE /api/patients/${id}] Patient deleted by ${user.email}`);
    
    return Response.json({ success: true, message: "Patient deleted successfully" });
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PATIENTS/DELETE] Failed to delete patient", err);
    return Response.json(
      { error: errorMessage ?? "Failed to delete patient" },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });

export const DELETE = deletePatientHandler;