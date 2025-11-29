import { prisma } from "../src/lib/db";

import { logger } from '../src/lib/logger';

async function testProgressTracking() {
  logger.info("Testing Patient Progress Tracking...\n");

  // Find or create test patient
  let patient = await prisma.patient.findFirst({
    where: {
      email: "rebecca@eonmeds.com"
    }
  });

  if (!patient) {
    logger.info("Creating test patient...");
    patient = await prisma.patient.create({
      data: {
        firstName: "Rebecca",
        lastName: "Pignano",
        dob: "1997-07-28",
        gender: "f",
        phone: "3857856102",
        email: "rebecca@eonmeds.com",
        address1: "123 Main St",
        city: "Salt Lake City",
        state: "UT",
        zip: "84101"
      }
    });
  }

  logger.info(`Patient: ${patient.firstName} ${patient.lastName} (ID: ${patient.id})\n`);

  // Add sample weight logs
  logger.info("Adding sample weight logs...");
  const weightLogs = [
    { weight: 180, daysAgo: 30 },
    { weight: 178.5, daysAgo: 25 },
    { weight: 177, daysAgo: 20 },
    { weight: 176.5, daysAgo: 15 },
    { weight: 175, daysAgo: 10 },
    { weight: 174.5, daysAgo: 5 },
    { weight: 173, daysAgo: 0 }
  ];

  for (const log of weightLogs) {
    const recordedAt = new Date();
    recordedAt.setDate(recordedAt.getDate() - log.daysAgo);
    
    await prisma.patientWeightLog.create({
      data: {
        patientId: patient.id,
        weight: log.weight,
        unit: "lbs",
        recordedAt,
        source: "patient"
      }
    });
    logger.info(`  - Added weight: ${log.weight} lbs (${log.daysAgo} days ago)`);
  }

  // Add medication reminders
  logger.info("\nAdding medication reminders...");
  const reminders = [
    { medication: "Semaglutide 0.5mg", dayOfWeek: 1, time: "08:00" }, // Monday
    { medication: "Vitamin D", dayOfWeek: 0, time: "09:00" }, // Sunday
  ];

  for (const reminder of reminders) {
    const existing = await prisma.patientMedicationReminder.findFirst({
      where: {
        patientId: patient.id,
        medicationName: reminder.medication,
        dayOfWeek: reminder.dayOfWeek
      }
    });

    if (!existing) {
      await prisma.patientMedicationReminder.create({
        data: {
          patientId: patient.id,
          medicationName: reminder.medication,
          dayOfWeek: reminder.dayOfWeek,
          timeOfDay: reminder.time,
          isActive: true
        }
      });
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      logger.info(`  - Added reminder: ${reminder.medication} on ${dayNames[reminder.dayOfWeek]} at ${reminder.time}`);
    }
  }

  logger.info("\n✅ Sample data added successfully!");
  logger.info(`\nView the patient's progress at: http://localhost:3001/patients/${patient.id}?tab=progress`);
}

testProgressTracking()
  .catch((e) => {
    logger.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
