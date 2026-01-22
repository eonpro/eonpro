import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";
import { z } from "zod";

const createNutritionLogSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().max(500).optional(),
  calories: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return isNaN(num) ? undefined : num;
  }),
  protein: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }),
  carbs: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }),
  fat: z.union([z.string(), z.number()]).optional().transform(val => {
    if (!val) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }),
  notes: z.string().max(500).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getNutritionLogsSchema = z.object({
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
    const parseResult = createNutritionLogSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }
    
    const { patientId, mealType, description, calories, protein, carbs, fat, notes, recordedAt } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const nutritionLog = await prisma.patientNutritionLog.create({
      data: {
        patientId,
        mealType,
        description: description || null,
        calories: calories || null,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? "patient" : "provider"
      }
    });

    return NextResponse.json(nutritionLog, { status: 201 });
  } catch (error) {
    logger.error("Failed to create nutrition log", { error });
    return NextResponse.json({ error: "Failed to create nutrition log" }, { status: 500 });
  }
});

export const POST = postHandler;

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parseResult = getNutritionLogsSchema.safeParse({
      patientId: searchParams.get("patientId"),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { patientId } = parseResult.data;

    if (!canAccessPatient(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const nutritionLogs = await prisma.patientNutritionLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });

    // Calculate today's totals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayLogs = nutritionLogs.filter(log => {
      const logDate = new Date(log.recordedAt);
      return logDate >= today && logDate <= todayEnd;
    });

    const todayCalories = todayLogs.reduce((sum, log) => sum + (log.calories || 0), 0);
    const todayProtein = todayLogs.reduce((sum, log) => sum + (log.protein || 0), 0);
    const todayCarbs = todayLogs.reduce((sum, log) => sum + (log.carbs || 0), 0);
    const todayFat = todayLogs.reduce((sum, log) => sum + (log.fat || 0), 0);

    return NextResponse.json({
      data: nutritionLogs,
      meta: { 
        count: nutritionLogs.length, 
        todayCalories,
        todayProtein: Math.round(todayProtein),
        todayCarbs: Math.round(todayCarbs),
        todayFat: Math.round(todayFat),
        patientId 
      }
    });
  } catch (error) {
    logger.error("Failed to fetch nutrition logs", { error });
    return NextResponse.json({ error: "Failed to fetch nutrition logs" }, { status: 500 });
  }
});

export const GET = getHandler;
