import { prisma } from "@/lib/db";
import { patientSchema } from "@/lib/validate";
import { withClinicalAuth } from '@/lib/auth/middleware';
import { NextRequest } from 'next/server';
import { encryptPatientPHI, decryptPatientPHI } from '@/lib/security/phi-encryption';

/**
 * GET /api/patients
 * Protected endpoint - requires provider, admin, or staff authentication
 * Providers see only their patients, admins and staff see all clinic patients
 */
export const GET = withClinicalAuth(async (req: NextRequest, user) => {
  // The Prisma proxy in db.ts automatically applies clinic filtering
  // based on the global clinic context, so we don't need to manually filter
  
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dob: true,
      gender: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      zip: true,
      tags: true,
      source: true,
      createdAt: true,
      // Exclude sensitive fields like notes, lifefileId, stripeCustomerId
    },
    orderBy: { createdAt: "desc" },
  });
  
  // Decrypt PHI fields for authorized users
  const decryptedPatients = patients.map(patient => 
    decryptPatientPHI(patient, ['email', 'phone', 'dob'])
  );
  
  return Response.json({ 
    patients: decryptedPatients,
    meta: {
      count: patients.length,
      accessedBy: user.email,
      role: user.role,
    }
  });
});

/**
 * POST /api/patients
 * Protected endpoint - requires provider or admin authentication
 * Creates a new patient with audit trail
 */
export const POST = withClinicalAuth(async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = patientSchema.safeParse(body);
  
  if (!parsed.success) {
    return Response.json(parsed.error, { status: 400 });
  }
  
  // The Prisma proxy in db.ts automatically applies clinic context
  
  const patient = await prisma.$transaction(async (tx: any) => {
    // Get next patient ID
    const counter = await tx.patientCounter.upsert({
      where: { id: 1 },
      create: { id: 1, current: 1 },
      update: { current: { increment: 1 } },
    });
    const patientId = counter.current.toString().padStart(6, "0");
    
    // Encrypt PHI fields before storing
    const encryptedData = encryptPatientPHI(parsed.data, ['email', 'phone', 'dob']);
    
    // Create patient (clinicId is automatically added by Prisma proxy)
    const newPatient = await tx.patient.create({
      data: {
        ...encryptedData,
        patientId,
        notes: parsed.data.notes ?? null,
        tags: parsed.data.tags ?? [],
        source: "api",
        sourceMetadata: {
          endpoint: "/api/patients",
          timestamp: new Date().toISOString(),
          userAgent: req.headers.get("user-agent") || "unknown",
          createdBy: user.email,
          createdByRole: user.role,
          createdById: user.id, // Store who created this patient
        }
      },
    });
    
    // Create audit log
    await tx.patientAudit.create({
      data: {
        patientId: newPatient.id,
        action: 'CREATE',
        actorEmail: user.email,
        diff: {
          created: parsed.data,
          by: user.email,
          role: user.role,
        },
      },
    });
    
    return newPatient;
  });
  
  return Response.json({ 
    patient,
    message: 'Patient created successfully',
  });
});