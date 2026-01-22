import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";
import { standardRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const createExerciseLogSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  activityType: z.string().min(1).max(100),
  duration: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid duration');
    return num;
  }),
  intensity: z.enum(["light", "moderate", "vigorous"]).default("moderate"),
  calories: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? undefined : num;
  }),
  steps: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? undefined : num;
  }),
  distance: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }),
  notes: z.string().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getExerciseLogsSchema = z.object({
  patientId: z.string().transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
});

function canAccessPatient(user: { role: string; patientId?: number }, patientId: number): boolean {
  if (user.role === 'patient') {
    return user.patientId === patientId;
  }
  return ['provider', 'admin', 'staff', 'super_admin'].includes(user.role);
}

const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = createExerciseLogSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }
    
    const { patientId, activityType, duration, intensity, calories, steps, distance, notes, recordedAt } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const exerciseLog = await prisma.patientExerciseLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        activityType,
        duration,
        intensity,
        calories: calories || null,
        steps: steps || null,
        distance: distance || null,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? "patient" : "provider"
      }
    });

    return NextResponse.json(exerciseLog, { status: 201 });
  } catch (error) {
    logger.error("Failed to create exercise log", { error });
    return NextResponse.json({ error: "Failed to create exercise log" }, { status: 500 });
  }
});

export const POST = standardRateLimit(postHandler);

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parseResult = getExerciseLogsSchema.safeParse({
      patientId: searchParams.get("patientId"),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const exerciseLogs = await prisma.patientExerciseLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    // Calculate weekly stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyLogs = exerciseLogs.filter(log => new Date(log.recordedAt) >= weekAgo);
    const weeklyMinutes = weeklyLogs.reduce((sum, log) => sum + log.duration, 0);
    const weeklyCalories = weeklyLogs.reduce((sum, log) => sum + (log.calories || 0), 0);

    return NextResponse.json({
      data: exerciseLogs,
      meta: { 
        count: exerciseLogs.length, 
        weeklyMinutes,
        weeklyCalories,
        patientId 
      }
    });
  } catch (error) {
    logger.error("Failed to fetch exercise logs", { error });
    return NextResponse.json({ error: "Failed to fetch exercise logs" }, { status: 500 });
  }
});

export const GET = standardRateLimit(getHandler);
