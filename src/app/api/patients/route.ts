import { prisma } from "@/lib/db";
import { patientSchema } from "@/lib/validate";
import { withClinicalAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { encryptPatientPHI, decryptPatientPHI } from '@/lib/security/phi-encryption';
import { relaxedRateLimit, standardRateLimit } from '@/lib/rateLimit';

/**
 * GET /api/patients
 * Protected endpoint - requires provider, admin, or staff authentication
 * Providers see only their patients, admins and staff see all clinic patients
 * Super admins see all patients across all clinics
 * Rate limit: 200 requests per minute (relaxed for list endpoints)
 */
const getPatientsHandler = withClinicalAuth(async (req: NextRequest, user) => {
  // For super admin, get all patients across all clinics
  // For other roles, the Prisma proxy in db.ts applies clinic filtering
  let patients;

  if (user.role === 'super_admin') {
    // Super admin sees all patients with clinic info
    patients = await prisma.patient.findMany({
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
        clinicId: true,
        clinic: {
          select: {
            name: true,
            subdomain: true,
          }
        }
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    patients = await prisma.patient.findMany({
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
        clinicId: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Decrypt PHI fields for authorized users and add clinic name
  const decryptedPatients = patients.map((patient: any) => {
    const decrypted = decryptPatientPHI(patient, ['email', 'phone', 'dob']);
    return {
      ...decrypted,
      clinicName: patient.clinic?.name || null,
    };
  });

  return Response.json({
    patients: decryptedPatients,
    meta: {
      count: patients.length,
      accessedBy: user.email,
      role: user.role,
    }
  });
});

// Apply rate limiting to GET endpoint
export const GET = relaxedRateLimit(getPatientsHandler);

/**
 * POST /api/patients
 * Protected endpoint - requires provider or admin authentication
 * Creates a new patient with audit trail
 * Rate limit: 60 requests per minute (standard)
 */
const createPatientHandler = withClinicalAuth(async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = patientSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(parsed.error, { status: 400 });
  }

  // Determine clinic ID:
  // - Super admin: must provide clinicId in the request
  // - Other roles: use their assigned clinicId
  let clinicIdToUse: number;

  if (user.role === 'super_admin') {
    // Super admin must specify a clinic
    if (parsed.data.clinicId) {
      clinicIdToUse = parsed.data.clinicId;
    } else {
      return Response.json(
        { error: 'Super admin must specify a clinic for the patient' },
        { status: 400 }
      );
    }
  } else {
    // For other roles, use their clinic or the provided one (if they have access)
    clinicIdToUse = parsed.data.clinicId || user.clinicId || 1;
  }

  const patient = await prisma.$transaction(async (tx: any) => {
    // Get next patient ID
    const counter = await tx.patientCounter.upsert({
      where: { id: 1 },
      create: { id: 1, current: 1 },
      update: { current: { increment: 1 } },
    });
    const patientId = counter.current.toString().padStart(6, "0");

    // Extract clinicId from parsed data to avoid including it in encryptedData
    const { clinicId: _, ...dataToEncrypt } = parsed.data;

    // Encrypt PHI fields before storing
    const encryptedData = encryptPatientPHI(dataToEncrypt, ['email', 'phone', 'dob']);

    // Create patient with explicit clinicId
    const newPatient = await tx.patient.create({
      data: {
        ...encryptedData,
        patientId,
        clinicId: clinicIdToUse,
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

// Apply rate limiting to POST endpoint
export const POST = standardRateLimit(createPatientHandler);