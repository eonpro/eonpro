import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";
import { z } from "zod";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createWeightLogSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  weight: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num <= 0 || num > 2000) throw new Error('Invalid weight');
    return num;
  }),
  unit: z.enum(["lbs", "kg"]).default("lbs"),
  notes: z.string().max(1000).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getWeightLogsSchema = z.object({
  patientId: z.string().transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  limit: z.string().optional().transform(val => {
    if (!val) return 100; // Default pagination limit
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) return 100;
    return Math.min(num, 500); // Max 500 records
  }),
});

const deleteWeightLogSchema = z.object({
  id: z.string().transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid id');
    return num;
  }),
});

// ============================================================================
// AUTHORIZATION HELPERS
// ============================================================================

/**
 * Check if user has access to a patient's data
 * - Patients can only access their own data
 * - Providers, admins, staff can access any patient in their clinic
 */
function canAccessPatient(user: { role: string; patientId?: number }, patientId: number): boolean {
  if (user.role === 'patient') {
    return user.patientId === patientId;
  }
  // Providers, admins, staff, super_admin can access any patient
  return ['provider', 'admin', 'staff', 'super_admin'].includes(user.role);
}

// ============================================================================
// POST /api/patient-progress/weight - Log a weight entry
// ============================================================================

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    // Parse and validate input
    const rawData = await request.json();
    const parseResult = createWeightLogSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }
    
    const { patientId, weight, unit, notes, recordedAt } = parseResult.data;

    // AUTHORIZATION CHECK FIRST - before any data access
    if (!canAccessPatient(user, patientId)) {
      logger.warn("Unauthorized weight log access attempt", { 
        userId: user.id, 
        attemptedPatientId: patientId 
      });
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify patient exists (and is in user's clinic via Prisma middleware)
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Create weight log
    const weightLog = await prisma.patientWeightLog.create({
      data: {
        patientId,
        weight,
        unit,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? "patient" : "provider"
      }
    });

    logger.info("Weight log created", { 
      patientId, 
      weight: weightLog.weight,
      id: weightLog.id,
      userId: user.id
    });

    return NextResponse.json(weightLog, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to create weight log", { error: errorMessage, userId: user.id });
    return NextResponse.json(
      { error: "Failed to create weight log" },
      { status: 500 }
    );
  }
});

export const POST = postHandler;

// ============================================================================
// GET /api/patient-progress/weight?patientId=X - Get weight logs for a patient
// ============================================================================

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const parseResult = getWeightLogsSchema.safeParse({
      patientId: searchParams.get("patientId"),
      limit: searchParams.get("limit"),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }

    const { patientId, limit } = parseResult.data;

    // AUTHORIZATION CHECK FIRST - before any data access
    if (!canAccessPatient(user, patientId)) {
      logger.warn("Unauthorized weight log access attempt", { 
        userId: user.id, 
        attemptedPatientId: patientId 
      });
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Now fetch data (after authorization passes)
    const weightLogs = await prisma.patientWeightLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: limit, // Always paginated
    });

    return NextResponse.json({
      data: weightLogs,
      meta: {
        count: weightLogs.length,
        limit,
        patientId,
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to fetch weight logs", { error: errorMessage, userId: user.id });
    return NextResponse.json(
      { error: "Failed to fetch weight logs" },
      { status: 500 }
    );
  }
});

export const GET = getHandler;

// ============================================================================
// DELETE /api/patient-progress/weight?id=X - Delete a weight log
// ============================================================================

const deleteHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const parseResult = deleteWeightLogSchema.safeParse({
      id: searchParams.get("id"),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid parameters" },
        { status: 400 }
      );
    }

    const { id } = parseResult.data;

    // Fetch the log to check ownership BEFORE deletion
    const log = await prisma.patientWeightLog.findUnique({ 
      where: { id },
      select: { id: true, patientId: true }
    });

    if (!log) {
      return NextResponse.json({ error: "Weight log not found" }, { status: 404 });
    }

    // AUTHORIZATION CHECK - verify user can access this patient's data
    if (!canAccessPatient(user, log.patientId)) {
      logger.warn("Unauthorized weight log deletion attempt", { 
        userId: user.id, 
        logId: id,
        patientId: log.patientId 
      });
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await prisma.patientWeightLog.delete({
      where: { id }
    });

    logger.info("Weight log deleted", { id, userId: user.id, patientId: log.patientId });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to delete weight log", { error: errorMessage, userId: user.id });
    return NextResponse.json(
      { error: "Failed to delete weight log" },
      { status: 500 }
    );
  }
});

export const DELETE = deleteHandler;
