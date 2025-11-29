import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// POST /api/patient-progress/weight - Log a weight entry
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { patientId, weight, unit = "lbs", notes, recordedAt } = data;

    if (!patientId || !weight) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const weightLog = await prisma.patientWeightLog.create({
      data: {
        patientId: parseInt(patientId),
        weight: parseFloat(weight),
        unit,
        notes,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: "patient"
      }
    });

    logger.info("Weight log created", { 
      patientId, 
      weight: weightLog.weight,
      id: weightLog.id 
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
}

// GET /api/patient-progress/weight?patientId=X - Get weight logs for a patient
export async function GET(request: NextRequest) {
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

    return NextResponse.json(weightLogs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to fetch weight logs", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to fetch weight logs" },
      { status: 500 }
    );
  }
}

// DELETE /api/patient-progress/weight?id=X - Delete a weight log
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter" },
        { status: 400 }
      );
    }

    await prisma.patientWeightLog.delete({
      where: {
        id: parseInt(id)
      }
    });

    logger.info("Weight log deleted", { id });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to delete weight log", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to delete weight log" },
      { status: 500 }
    );
  }
}
