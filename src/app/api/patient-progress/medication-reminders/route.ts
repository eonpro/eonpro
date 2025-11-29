import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// POST /api/patient-progress/medication-reminders - Create or update a reminder
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { patientId, medicationName, dayOfWeek, timeOfDay = "08:00", isActive = true } = data;

    if (!patientId || !medicationName || dayOfWeek === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if reminder already exists
    const existing = await prisma.patientMedicationReminder.findFirst({
      where: {
        patientId: parseInt(patientId),
        medicationName,
        dayOfWeek: parseInt(dayOfWeek)
      }
    });

    let reminder;
    if (existing) {
      // Update existing reminder
      reminder = await prisma.patientMedicationReminder.update({
        where: {
          id: existing.id
        },
        data: {
          timeOfDay,
          isActive,
          updatedAt: new Date()
        }
      });
    } else {
      // Create new reminder
      reminder = await prisma.patientMedicationReminder.create({
        data: {
          patientId: parseInt(patientId),
          medicationName,
          dayOfWeek: parseInt(dayOfWeek),
          timeOfDay,
          isActive
        }
      });
    }

    logger.info("Medication reminder saved", { 
      patientId, 
      medicationName,
      dayOfWeek,
      id: reminder.id 
    });

    return NextResponse.json(reminder);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to save medication reminder", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to save medication reminder" },
      { status: 500 }
    );
  }
}

// GET /api/patient-progress/medication-reminders?patientId=X - Get reminders for a patient
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { error: "Missing patientId parameter" },
        { status: 400 }
      );
    }

    const reminders = await prisma.patientMedicationReminder.findMany({
      where: {
        patientId: parseInt(patientId),
        isActive: true
      },
      orderBy: [
        { medicationName: "asc" },
        { dayOfWeek: "asc" }
      ]
    });

    return NextResponse.json(reminders);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to fetch medication reminders", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to fetch medication reminders" },
      { status: 500 }
    );
  }
}

// DELETE /api/patient-progress/medication-reminders?id=X - Delete a reminder
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

    await prisma.patientMedicationReminder.delete({
      where: {
        id: parseInt(id)
      }
    });

    logger.info("Medication reminder deleted", { id });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to delete medication reminder", { error: errorMessage });
    return NextResponse.json(
      { error: "Failed to delete medication reminder" },
      { status: 500 }
    );
  }
}
