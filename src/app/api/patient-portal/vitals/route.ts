import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

/**
 * GET /api/patient-portal/vitals
 *
 * Returns the patient's initial intake vitals (height, weight, BMI)
 * from their intake form submission.
 *
 * These vitals are read-only and represent the initial measurements
 * recorded during the intake process.
 */

interface Vitals {
  height: string | null;
  weight: string | null;
  bmi: string | null;
}

const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    // Only patients can access this endpoint
    if (user.role !== 'patient' || !user.patientId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const patientId = user.patientId;

    // Fetch patient with intake documents and submissions
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        documents: {
          where: { category: 'MEDICAL_INTAKE_FORM' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            patientId: true,
            category: true,
            filename: true,
            createdAt: true,
            data: true,
          },
        },
        intakeSubmissions: {
          include: {
            responses: {
              include: {
                question: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Parse document data if it exists
    const documentsWithParsedData = patient.documents.map((doc: any) => {
      if (doc.data && Buffer.isBuffer(doc.data)) {
        try {
          const jsonStr = doc.data.toString('utf-8');
          return { ...doc, data: JSON.parse(jsonStr) };
        } catch {
          return { ...doc, data: null };
        }
      }
      // Handle serialized buffer format { type: 'Buffer', data: [...] }
      if (
        doc.data &&
        typeof doc.data === 'object' &&
        doc.data.type === 'Buffer' &&
        Array.isArray(doc.data.data)
      ) {
        try {
          const jsonStr = Buffer.from(doc.data.data).toString('utf-8');
          return { ...doc, data: JSON.parse(jsonStr) };
        } catch {
          return { ...doc, data: null };
        }
      }
      return doc;
    });

    // Extract vitals from multiple sources
    const vitals = extractVitals(documentsWithParsedData, patient.intakeSubmissions);

    logger.info('Patient portal vitals fetched', { patientId });

    try {
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: patient.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Patient',
        resourceId: String(patientId),
        patientId,
        action: 'portal_vitals',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for portal vitals', {
        patientId,
        userId: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      data: vitals,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/vitals',
      context: { patientId: user?.patientId },
    });
  }
});

/**
 * Extract vitals from intake documents and submissions
 * Based on the same logic used in the provider patient profile page
 */
function extractVitals(documentsWithParsedData: any[], intakeSubmissions: any[]): Vitals {
  const result: Vitals = {
    height: null,
    weight: null,
    bmi: null,
  };

  // Helper to find value by label in various data sources
  const findValue = (...labels: string[]): string | null => {
    // Source 1: Document data with sections array
    const intakeDoc = documentsWithParsedData.find(
      (d: any) =>
        d.category === 'MEDICAL_INTAKE_FORM' &&
        d.data &&
        typeof d.data === 'object' &&
        !Buffer.isBuffer(d.data) &&
        !(d.data.type === 'Buffer')
    );

    if (intakeDoc?.data) {
      // Check sections array
      if (intakeDoc.data.sections && Array.isArray(intakeDoc.data.sections)) {
        for (const section of intakeDoc.data.sections) {
          if (section.entries && Array.isArray(section.entries)) {
            for (const entry of section.entries) {
              const entryLabel = (entry.label || '').toLowerCase();
              for (const label of labels) {
                if (entryLabel.includes(label.toLowerCase()) && entry.value && entry.value !== '') {
                  return String(entry.value);
                }
              }
            }
          }
        }
      }

      // Also check answers array directly (some webhooks store this way)
      if (intakeDoc.data.answers && Array.isArray(intakeDoc.data.answers)) {
        for (const answer of intakeDoc.data.answers) {
          const answerLabel = (answer.label || '').toLowerCase();
          for (const label of labels) {
            if (answerLabel.includes(label.toLowerCase()) && answer.value && answer.value !== '') {
              return String(answer.value);
            }
          }
        }
      }
    }

    // Source 2: IntakeSubmissions responses
    if (intakeSubmissions?.length > 0) {
      for (const submission of intakeSubmissions) {
        if (submission.responses && Array.isArray(submission.responses)) {
          for (const response of submission.responses) {
            const questionText = (
              response.question?.text ||
              response.question?.label ||
              ''
            ).toLowerCase();
            for (const label of labels) {
              if (
                questionText.includes(label.toLowerCase()) &&
                response.value &&
                response.value !== ''
              ) {
                return String(response.value);
              }
            }
          }
        }
      }
    }

    // Source 3: Flat key-value in document data
    if (intakeDoc?.data && typeof intakeDoc.data === 'object') {
      for (const label of labels) {
        const searchKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [key, value] of Object.entries(intakeDoc.data)) {
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normalizedKey.includes(searchKey) && value && value !== '') {
            return String(value);
          }
        }
      }
    }

    return null;
  };

  // Extract height - try separate feet/inches first, then combined value
  const heightFeet = findValue('height (feet)', 'height feet', 'heightfeet');
  const heightInches = findValue('height (inches)', 'height inches', 'heightinches');
  if (heightFeet) {
    result.height = heightInches ? `${heightFeet}'${heightInches}"` : `${heightFeet}'0"`;
  } else {
    // Fallback: look for combined height value (e.g., "5'2"" or "62 inches")
    result.height = findValue('height');
  }

  // Extract weight - specifically look for "starting weight" first (initial intake weight)
  result.weight = findValue('starting weight', 'current weight', 'weight');

  // Extract BMI - or calculate it if we have height and weight
  let bmiValue = findValue('bmi');

  if (!bmiValue && result.height && result.weight) {
    // Try to calculate BMI from height and weight
    const calculatedBmi = calculateBMI(result.height, result.weight);
    if (calculatedBmi) {
      bmiValue = calculatedBmi.toFixed(2);
    }
  }

  result.bmi = bmiValue;

  return result;
}

/**
 * Calculate BMI from height and weight strings
 */
function calculateBMI(heightStr: string, weightStr: string): number | null {
  try {
    // Parse weight (assuming lbs)
    const weight = parseFloat(weightStr.replace(/[^0-9.]/g, ''));
    if (isNaN(weight) || weight <= 0) return null;

    // Parse height (could be "5'8"", "5'8", "68 inches", "68", etc.)
    let heightInches: number;

    // Check for feet/inches format (e.g., "5'8"" or "5'8")
    const feetInchMatch = heightStr.match(/(\d+)'(\d+)/);
    if (feetInchMatch) {
      const feet = parseInt(feetInchMatch[1], 10);
      const inches = parseInt(feetInchMatch[2], 10);
      heightInches = feet * 12 + inches;
    } else {
      // Try to parse as inches directly
      heightInches = parseFloat(heightStr.replace(/[^0-9.]/g, ''));
    }

    if (isNaN(heightInches) || heightInches <= 0) return null;

    // BMI formula for lbs and inches: (weight / height²) × 703
    const bmi = (weight / (heightInches * heightInches)) * 703;

    // Sanity check - BMI should be between 10 and 100
    if (bmi < 10 || bmi > 100) return null;

    return bmi;
  } catch {
    return null;
  }
}

export const GET = getHandler;
