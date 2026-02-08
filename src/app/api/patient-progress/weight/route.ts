import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createWeightLogSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  weight: z.union([z.string(), z.number()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num <= 0 || num > 2000) throw new Error('Invalid weight');
    return num;
  }),
  unit: z.enum(['lbs', 'kg']).default('lbs'),
  notes: z.string().max(1000).optional(),
  recordedAt: z.string().datetime().optional(),
});

const getWeightLogsSchema = z.object({
  patientId: z.string().transform((val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 100; // Default pagination limit
      const num = parseInt(val, 10);
      if (isNaN(num) || num <= 0) return 100;
      return Math.min(num, 500); // Max 500 records
    }),
});

const deleteWeightLogSchema = z.object({
  id: z.string().transform((val) => {
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
        { error: 'Invalid input', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, weight, unit, notes, recordedAt } = parseResult.data;

    // AUTHORIZATION CHECK FIRST - before any data access
    if (!canAccessPatient(user, patientId)) {
      logger.warn('Unauthorized weight log access attempt', {
        userId: user.id,
        attemptedPatientId: patientId,
      });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify patient exists (and is in user's clinic via Prisma middleware)
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Create weight log
    const weightLog = await prisma.patientWeightLog.create({
      data: {
        patientId,
        weight,
        unit,
        notes: notes || null,
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        source: user.role === 'patient' ? 'patient' : 'provider',
      },
    });

    logger.info('Weight log created', {
      patientId,
      weight: weightLog.weight,
      id: weightLog.id,
      userId: user.id,
    });

    return NextResponse.json(weightLog, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create weight log', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to create weight log' }, { status: 500 });
  }
});

export const POST = postHandler;

// ============================================================================
// GET /api/patient-progress/weight?patientId=X - Get weight logs for a patient
// ============================================================================

/**
 * Extract initial weight from intake documents or submissions
 */
async function getIntakeWeight(
  patientId: number
): Promise<{ weight: number; recordedAt: Date } | null> {
  try {
    // Fetch patient with intake documents and submissions
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        documents: {
          where: { category: 'MEDICAL_INTAKE_FORM' },
          orderBy: { createdAt: 'asc' }, // Get oldest first (initial intake)
          take: 1,
        },
        intakeSubmissions: {
          include: {
            responses: {
              include: {
                question: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!patient) return null;

    // Helper to find value by label
    const findWeightValue = (data: any, submissions: any[]): string | null => {
      const labels = ['starting weight', 'current weight', 'weight'];

      // Source 1: Document data with sections array
      if (data && typeof data === 'object') {
        // Check sections array
        if (data.sections && Array.isArray(data.sections)) {
          for (const section of data.sections) {
            if (section.entries && Array.isArray(section.entries)) {
              for (const entry of section.entries) {
                const entryLabel = (entry.label || '').toLowerCase();
                for (const label of labels) {
                  if (entryLabel.includes(label) && entry.value && entry.value !== '') {
                    return String(entry.value);
                  }
                }
              }
            }
          }
        }

        // Check answers array
        if (data.answers && Array.isArray(data.answers)) {
          for (const answer of data.answers) {
            const answerLabel = (answer.label || '').toLowerCase();
            for (const label of labels) {
              if (answerLabel.includes(label) && answer.value && answer.value !== '') {
                return String(answer.value);
              }
            }
          }
        }

        // Check flat key-value pairs
        for (const label of labels) {
          const searchKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const [key, value] of Object.entries(data)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedKey.includes(searchKey) && value && value !== '') {
              return String(value);
            }
          }
        }
      }

      // Source 2: IntakeSubmissions responses
      if (submissions?.length > 0) {
        for (const submission of submissions) {
          if (submission.responses && Array.isArray(submission.responses)) {
            for (const response of submission.responses) {
              const questionText = (
                response.question?.text ||
                response.question?.label ||
                ''
              ).toLowerCase();
              for (const label of labels) {
                if (questionText.includes(label) && response.value && response.value !== '') {
                  return String(response.value);
                }
              }
            }
          }
        }
      }

      return null;
    };

    // Parse document data if it exists
    let parsedData = null;
    const doc = patient.documents[0];
    if (doc?.data) {
      if (Buffer.isBuffer(doc.data)) {
        try {
          const jsonStr = (doc.data as Buffer).toString('utf-8');
          parsedData = JSON.parse(jsonStr);
        } catch {
          // Ignore parse errors
        }
      } else if (
        typeof doc.data === 'object' &&
        (doc.data as any).type === 'Buffer' &&
        Array.isArray((doc.data as any).data)
      ) {
        try {
          const jsonStr = Buffer.from((doc.data as any).data).toString('utf-8');
          parsedData = JSON.parse(jsonStr);
        } catch {
          // Ignore parse errors
        }
      } else if (typeof doc.data === 'object') {
        parsedData = doc.data;
      }
    }

    const weightStr = findWeightValue(parsedData, patient.intakeSubmissions);
    if (!weightStr) return null;

    // Parse weight value (remove non-numeric characters except decimal)
    const weight = parseFloat(weightStr.replace(/[^0-9.]/g, ''));
    if (isNaN(weight) || weight <= 0 || weight > 2000) return null;

    // Use the intake document/submission creation date
    const recordedAt =
      doc?.createdAt || patient.intakeSubmissions[0]?.createdAt || patient.createdAt;

    return { weight, recordedAt: new Date(recordedAt) };
  } catch (error) {
    logger.error('Failed to extract intake weight', { patientId, error });
    return null;
  }
}

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    // nextUrl.searchParams can omit query string on some Vercel/serverless runs; fallback to request.url then auth
    const nextParams = request.nextUrl.searchParams;
    const urlParams = new URL(request.url).searchParams;
    let patientIdParam = nextParams.get('patientId') ?? urlParams.get('patientId');
    const limitParam = nextParams.get('limit') ?? urlParams.get('limit');
    if (patientIdParam == null && user.role === 'patient' && user.patientId != null) {
      patientIdParam = String(user.patientId);
    }

    const parseResult = getWeightLogsSchema.safeParse({
      patientId: patientIdParam,
      limit: limitParam,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: parseResult.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { patientId, limit } = parseResult.data;

    // AUTHORIZATION CHECK FIRST - before any data access
    if (!canAccessPatient(user, patientId)) {
      logger.warn('Unauthorized weight log access attempt', {
        userId: user.id,
        attemptedPatientId: patientId,
      });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch weight logs from database
    const weightLogs = await prisma.patientWeightLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    // Get initial intake weight
    const intakeWeight = await getIntakeWeight(patientId);

    // Combine logs - add intake weight as first entry if it exists and isn't already in logs
    let allLogs = [...weightLogs];

    if (intakeWeight) {
      // Check if we already have a weight log at or before the intake date
      const hasEarlierOrSameEntry = weightLogs.some(
        (log) => new Date(log.recordedAt).getTime() <= intakeWeight.recordedAt.getTime()
      );

      // Also check if intake weight is roughly the same as any existing entry
      // (to avoid duplicates if someone manually added the intake weight)
      const hasSimilarWeight = weightLogs.some(
        (log) =>
          Math.abs(log.weight - intakeWeight.weight) < 0.5 &&
          Math.abs(new Date(log.recordedAt).getTime() - intakeWeight.recordedAt.getTime()) <
            24 * 60 * 60 * 1000 // Within 24 hours
      );

      if (!hasEarlierOrSameEntry && !hasSimilarWeight) {
        // Add intake weight as a synthetic entry
        allLogs.push({
          id: -1, // Synthetic ID to indicate intake entry
          createdAt: intakeWeight.recordedAt,
          patientId,
          weight: intakeWeight.weight,
          unit: 'lbs',
          notes: 'Initial weight from intake form',
          source: 'intake',
          recordedAt: intakeWeight.recordedAt,
        } as any);

        // Re-sort by date descending
        allLogs.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
      }
    }

    return NextResponse.json({
      data: allLogs,
      meta: {
        count: allLogs.length,
        limit,
        patientId,
        hasIntakeWeight: !!intakeWeight,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch weight logs', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to fetch weight logs' }, { status: 500 });
  }
});

export const GET = getHandler;

// ============================================================================
// DELETE /api/patient-progress/weight?id=X - Delete a weight log
// ============================================================================

const deleteHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const nextParams = request.nextUrl.searchParams;
    const idParam = nextParams.get('id') ?? new URL(request.url).searchParams.get('id');

    const parseResult = deleteWeightLogSchema.safeParse({
      id: idParam,
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { id } = parseResult.data;

    // Fetch the log to check ownership BEFORE deletion
    const log = await prisma.patientWeightLog.findUnique({
      where: { id },
      select: { id: true, patientId: true },
    });

    if (!log) {
      return NextResponse.json({ error: 'Weight log not found' }, { status: 404 });
    }

    // AUTHORIZATION CHECK - verify user can access this patient's data
    if (!canAccessPatient(user, log.patientId)) {
      logger.warn('Unauthorized weight log deletion attempt', {
        userId: user.id,
        logId: id,
        patientId: log.patientId,
      });
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.patientWeightLog.delete({
      where: { id },
    });

    logger.info('Weight log deleted', { id, userId: user.id, patientId: log.patientId });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete weight log', { error: errorMessage, userId: user.id });
    return NextResponse.json({ error: 'Failed to delete weight log' }, { status: 500 });
  }
});

export const DELETE = deleteHandler;
