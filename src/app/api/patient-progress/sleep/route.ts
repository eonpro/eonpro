import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";
import { standardRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const createSleepLogSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  sleepStart: z.string().datetime(),
  sleepEnd: z.string().datetime(),
  quality: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num < 1 || num > 10) return undefined;
    return num;
  }),
  notes: z.string().max(500).optional(),
});

const getSleepLogsSchema = z.object({
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
    const parseResult = createSleepLogSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }
    
    const { patientId, sleepStart, sleepEnd, quality, notes } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Calculate duration in minutes
    const start = new Date(sleepStart);
    const end = new Date(sleepEnd);
    const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

    const sleepLog = await prisma.patientSleepLog.create({
      data: {
        patientId,
        clinicId: user.clinicId || null,
        sleepStart: start,
        sleepEnd: end,
        duration,
        quality: quality || null,
        notes: notes || null,
        recordedAt: new Date(),
        source: user.role === 'patient' ? "patient" : "provider"
      }
    });

    return NextResponse.json(sleepLog, { status: 201 });
  } catch (error) {
    logger.error("Failed to create sleep log", { error });
    return NextResponse.json({ error: "Failed to create sleep log" }, { status: 500 });
  }
});

export const POST = standardRateLimit(postHandler);

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const urlParams = new URL(request.url).searchParams;
    const nextParams = request.nextUrl.searchParams;
    const parseResult = getSleepLogsSchema.safeParse({
      patientId: nextParams.get("patientId") ?? urlParams.get("patientId"),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const sleepLogs = await prisma.patientSleepLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    // Calculate weekly average
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    type SleepLog = typeof sleepLogs[number];
    const weeklyLogs = sleepLogs.filter((log: SleepLog) => new Date(log.recordedAt) >= weekAgo);
    const avgSleepMinutes = weeklyLogs.length > 0 
      ? Math.round(weeklyLogs.reduce((sum: number, log: SleepLog) => sum + log.duration, 0) / weeklyLogs.length)
      : 0;
    const logsWithQuality = weeklyLogs.filter((l: SleepLog) => l.quality !== null);
    const avgQuality = logsWithQuality.length > 0
      ? logsWithQuality.reduce((sum: number, log: SleepLog) => sum + (log.quality || 0), 0) / logsWithQuality.length
      : null;

    return NextResponse.json({
      data: sleepLogs,
      meta: { 
        count: sleepLogs.length, 
        avgSleepMinutes,
        avgSleepHours: Math.round(avgSleepMinutes / 60 * 10) / 10,
        avgQuality: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
        patientId 
      }
    });
  } catch (error) {
    logger.error("Failed to fetch sleep logs", { error });
    return NextResponse.json({ error: "Failed to fetch sleep logs" }, { status: 500 });
  }
});

export const GET = standardRateLimit(getHandler);
