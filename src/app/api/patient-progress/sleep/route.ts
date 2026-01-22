import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";
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

export const POST = postHandler;

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parseResult = getSleepLogsSchema.safeParse({
      patientId: searchParams.get("patientId"),
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

    const weeklyLogs = sleepLogs.filter(log => new Date(log.recordedAt) >= weekAgo);
    const avgSleepMinutes = weeklyLogs.length > 0 
      ? Math.round(weeklyLogs.reduce((sum, log) => sum + log.duration, 0) / weeklyLogs.length)
      : 0;
    const avgQuality = weeklyLogs.filter(l => l.quality).length > 0
      ? weeklyLogs.filter(l => l.quality).reduce((sum, log) => sum + (log.quality || 0), 0) / weeklyLogs.filter(l => l.quality).length
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

export const GET = getHandler;
