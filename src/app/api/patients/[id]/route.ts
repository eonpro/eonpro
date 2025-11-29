import { prisma } from "@/lib/db";
import { patientSchema } from "@/lib/validate";
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';
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

export const GET = withAuthParams(async (_request, user, { params }: Params) => {
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
  
  // Decrypt PHI fields for authorized users
  const decryptedPatient = decryptPatientPHI(patient, ['email', 'phone', 'dob']);
  
  return Response.json({ patient: decryptedPatient });
}, { roles: ['admin', 'provider', 'patient'] });

export const PATCH = withAuthParams(async (request, user, { params }: Params) => {
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
}, { roles: ['admin', 'provider', 'patient'] });

