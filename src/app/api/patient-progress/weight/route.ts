import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth/middleware";

// POST /api/patient-progress/weight - Log a weight entry
// Protected: requires authentication
const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const data = await request.json();
    const { patientId, weight, unit = "lbs", notes, recordedAt } = data;

    if (!patientId || !weight) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user has access to this patient (provider sees their patients, patient sees themselves)
    if (user.role === 'patient' && user.patientId !== parseInt(patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const weightLog = await prisma.patientWeightLog.create({
      data: {
        patientId: parseInt(patientId),
        weight: parseFloat(weight),
        unit,
        notes,
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

    return NextResponse.json(weightLog);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to create weight log", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to create weight log" },
      { status: 500 }
    );
  }
});

export const POST = postHandler;

// GET /api/patient-progress/weight?patientId=X - Get weight logs for a patient
// Protected: requires authentication
const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get("patientId");
    const limit = searchParams.get("limit");

    if (!patientId) {
      return NextResponse.json(
        { error: "Missing patientId parameter" },
        { status: 400 }
      );
    }

    const weightLogs = await prisma.patientWeightLog.findMany({
      where: {
        patientId: parseInt(patientId)
      },
      orderBy: {
        recordedAt: "desc"
      },
      take: limit ? parseInt(limit) : undefined
    });

    // Verify user has access to this patient
    if (user.role === 'patient' && user.patientId !== parseInt(patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(weightLogs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to fetch weight logs", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to fetch weight logs" },
      { status: 500 }
    );
  }
});

export const GET = getHandler;

// DELETE /api/patient-progress/weight?id=X - Delete a weight log
// Protected: requires authentication
const deleteHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter" },
        { status: 400 }
      );
    }

    // Verify ownership before deletion (admins/providers can delete any)
    if (user.role === 'patient') {
      const log = await prisma.patientWeightLog.findUnique({ 
        where: { id: parseInt(id) },
        select: { patientId: true }
      });
      if (log?.patientId !== user.patientId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    await prisma.patientWeightLog.delete({
      where: {
        id: parseInt(id)
      }
    });

    logger.info("Weight log deleted", { id, userId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to delete weight log", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to delete weight log" },
      { status: 500 }
    );
  }
});

export const DELETE = deleteHandler;
