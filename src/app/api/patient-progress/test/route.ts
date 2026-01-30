import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/patient-progress/test?patientId=X
 *
 * Test endpoint to verify all patient progress database operations work correctly.
 * Returns a comprehensive report of what data exists and can be retrieved.
 * 
 * RESTRICTED: Only available to super_admin and admin roles
 */
const getHandler = withAuth(async (request: NextRequest, user) => {
  // Only allow super_admin and admin
  if (!['super_admin', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Access denied - admin only' }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    const results: any = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: { passed: 0, failed: 0 },
    };

    // Test 1: Database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      results.tests.databaseConnection = { status: 'PASS', message: 'Database connected' };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.databaseConnection = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // Test 2: PatientWeightLog table exists and is accessible
    try {
      const count = await prisma.patientWeightLog.count();
      results.tests.weightLogTable = {
        status: 'PASS',
        message: `PatientWeightLog table accessible, ${count} total records`,
      };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.weightLogTable = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // Test 3: PatientMedicationReminder table exists and is accessible
    try {
      const count = await prisma.patientMedicationReminder.count();
      results.tests.reminderTable = {
        status: 'PASS',
        message: `PatientMedicationReminder table accessible, ${count} total records`,
      };
      results.summary.passed++;
    } catch (error: any) {
      results.tests.reminderTable = { status: 'FAIL', message: error.message };
      results.summary.failed++;
    }

    // If patientId provided, run patient-specific tests
    if (patientId) {
      const pid = parseInt(patientId);

      // Test 4: Patient exists
      try {
        const patient = await prisma.patient.findUnique({
          where: { id: pid },
          select: { id: true, firstName: true, lastName: true },
        });
        if (patient) {
          results.tests.patientExists = {
            status: 'PASS',
            message: `Patient found: ${patient.firstName} ${patient.lastName}`,
            data: patient,
          };
          results.summary.passed++;
        } else {
          results.tests.patientExists = {
            status: 'FAIL',
            message: `Patient with ID ${pid} not found`,
          };
          results.summary.failed++;
        }
      } catch (error: any) {
        results.tests.patientExists = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }

      // Test 5: Fetch weight logs for patient
      try {
        const weightLogs = await prisma.patientWeightLog.findMany({
          where: { patientId: pid },
          orderBy: { recordedAt: 'desc' },
          take: 5,
        });
        results.tests.patientWeightLogs = {
          status: 'PASS',
          message: `Found ${weightLogs.length} weight logs for patient`,
          count: weightLogs.length,
          recentLogs: weightLogs.map(
            (log: {
              id: number;
              weight: number;
              unit: string;
              recordedAt: Date;
              source: string;
            }) => ({
              id: log.id,
              weight: log.weight,
              unit: log.unit,
              recordedAt: log.recordedAt,
              source: log.source,
            })
          ),
        };
        results.summary.passed++;
      } catch (error: any) {
        results.tests.patientWeightLogs = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }

      // Test 6: Fetch medication reminders for patient
      try {
        const reminders = await prisma.patientMedicationReminder.findMany({
          where: { patientId: pid },
        });
        results.tests.patientReminders = {
          status: 'PASS',
          message: `Found ${reminders.length} medication reminders for patient`,
          count: reminders.length,
          reminders: reminders.map(
            (r: {
              id: number;
              medicationName: string;
              dayOfWeek: number;
              timeOfDay: string;
              isActive: boolean;
            }) => ({
              id: r.id,
              medicationName: r.medicationName,
              dayOfWeek: r.dayOfWeek,
              timeOfDay: r.timeOfDay,
              isActive: r.isActive,
            })
          ),
        };
        results.summary.passed++;
      } catch (error: any) {
        results.tests.patientReminders = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }

      // Test 7: Create a test weight log (then delete it)
      try {
        const testWeight = await prisma.patientWeightLog.create({
          data: {
            patientId: pid,
            weight: 999.9, // Obvious test value
            unit: 'lbs',
            notes: 'TEST - This should be deleted',
            source: 'test',
            recordedAt: new Date(),
          },
        });

        // Verify it was created
        const verified = await prisma.patientWeightLog.findUnique({
          where: { id: testWeight.id },
        });

        // Delete the test record
        await prisma.patientWeightLog.delete({
          where: { id: testWeight.id },
        });

        results.tests.weightLogCRUD = {
          status: 'PASS',
          message: 'Successfully created, verified, and deleted test weight log',
          testId: testWeight.id,
        };
        results.summary.passed++;
      } catch (error: any) {
        results.tests.weightLogCRUD = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }

      // Test 8: Create a test reminder (then delete it)
      try {
        // Use a unique combination to avoid conflicts
        const testReminder = await prisma.patientMedicationReminder.create({
          data: {
            patientId: pid,
            medicationName: 'TEST_MEDICATION_DELETE_ME',
            dayOfWeek: 6, // Saturday
            timeOfDay: '23:59',
            isActive: false,
          },
        });

        // Delete the test record
        await prisma.patientMedicationReminder.delete({
          where: { id: testReminder.id },
        });

        results.tests.reminderCRUD = {
          status: 'PASS',
          message: 'Successfully created and deleted test medication reminder',
          testId: testReminder.id,
        };
        results.summary.passed++;
      } catch (error: any) {
        results.tests.reminderCRUD = { status: 'FAIL', message: error.message };
        results.summary.failed++;
      }
    }

    // Final status
    results.overallStatus = results.summary.failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';

    logger.info('Patient progress test completed', { userId: user.id, passed: results.summary.passed, failed: results.summary.failed });
    
    return NextResponse.json(results, {
      status: results.summary.failed > 0 ? 500 : 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Test endpoint failed', { error: errorMessage, userId: user.id });
    return NextResponse.json(
      { error: 'Test endpoint failed' },
      { status: 500 }
    );
  }
});

// Export GET handler
export const GET = getHandler;

/**
 * POST /api/patient-progress/test
 *
 * Create test data for a patient (for development/testing only)
 * RESTRICTED: Only available in development and to admin roles
 */
const postHandler = withAuth(async (request: NextRequest, user) => {
  // Only allow super_admin and admin
  if (!['super_admin', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Access denied - admin only' }, { status: 403 });
  }

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const rawBody = await request.json();
    const { patientId, createWeightLogs = true, createReminders = true } = rawBody;

    if (!patientId) {
      return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    const pid = parseInt(patientId);
    const results: any = { patientId: pid, created: {} };

    // Create sample weight logs
    if (createWeightLogs) {
      const now = new Date();
      const weightLogs = [];

      for (let i = 0; i < 10; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 7); // Weekly entries going back

        weightLogs.push({
          patientId: pid,
          weight: 200 - i * 2 + Math.random() * 2, // Gradual weight loss with variation
          unit: 'lbs',
          source: 'test',
          recordedAt: date,
          notes: i === 0 ? 'Most recent entry' : null,
        });
      }

      const created = await prisma.patientWeightLog.createMany({
        data: weightLogs,
        skipDuplicates: true,
      });

      results.created.weightLogs = created.count;
    }

    // Create sample medication reminders
    if (createReminders) {
      const reminders = [
        {
          patientId: pid,
          medicationName: 'Semaglutide 0.5mg',
          dayOfWeek: 3, // Wednesday
          timeOfDay: '08:00',
          isActive: true,
        },
        {
          patientId: pid,
          medicationName: 'Vitamin B12',
          dayOfWeek: 1, // Monday
          timeOfDay: '09:00',
          isActive: true,
        },
      ];

      let createdCount = 0;
      for (const reminder of reminders) {
        try {
          await prisma.patientMedicationReminder.create({ data: reminder });
          createdCount++;
        } catch (error: unknown) {
          // Skip if already exists (unique constraint)
          logger.warn('[PATIENT-PROGRESS-TEST] Reminder creation skipped (duplicate)', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      results.created.reminders = createdCount;
    }

    logger.info('Test data created', { userId: user.id, patientId: pid });
    
    return NextResponse.json({
      success: true,
      message: 'Test data created',
      ...results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create test data', { error: errorMessage, userId: user.id });
    return NextResponse.json(
      { error: 'Failed to create test data' },
      { status: 500 }
    );
  }
});

// Export POST handler
export const POST = postHandler;
