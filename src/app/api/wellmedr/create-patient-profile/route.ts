import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { runWithClinicContext } from '@/lib/db/clinic-context';
import {
  patientDeduplicationService,
  type IntakePatientData,
} from '@/domains/patient';

const WELLMEDR_CLINIC_ID = parseInt(process.env.WELLMEDR_CLINIC_ID || '7', 10);

const patientProfileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(30).optional().default(''),
  dob: z.string().max(20).optional().default(''),
  sex: z.string().max(20).optional().default('unknown'),

  shippingAddress: z.object({
    address: z.string().max(200).optional().default(''),
    apt: z.string().max(50).optional().default(''),
    city: z.string().max(100).optional().default(''),
    state: z.string().max(50).optional().default(''),
    zipCode: z.string().max(20).optional().default(''),
  }),

  weight: z.union([z.string(), z.number()]).optional(),
  goalWeight: z.union([z.string(), z.number()]).optional(),

  intakeSummary: z.object({
    healthConditions: z.array(z.string()).optional(),
    allergies: z.array(z.string()).optional(),
    medications: z.array(z.string()).optional(),
    glp1Type: z.string().optional(),
    contraindications: z.array(z.string()).optional(),
  }).optional(),
});

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = patientProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      );
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      dob,
      sex,
      shippingAddress,
      weight,
      goalWeight,
      intakeSummary,
    } = parsed.data;

    const genderMap: Record<string, string> = {
      male: 'male',
      female: 'female',
      m: 'male',
      f: 'female',
    };
    const gender = genderMap[sex.toLowerCase()] || 'unknown';

    const intakeData: IntakePatientData = {
      firstName,
      lastName,
      email,
      phone: phone || '',
      dob: dob || '1900-01-01',
      gender,
      address1: shippingAddress.address || '',
      address2: shippingAddress.apt || undefined,
      city: shippingAddress.city || '',
      state: shippingAddress.state || '',
      zip: shippingAddress.zipCode || '',
    };

    const sourceMetadata: Record<string, unknown> = {
      createdFrom: 'checkout_shipping',
      timestamp: new Date().toISOString(),
    };

    if (weight !== undefined) sourceMetadata.weight = Number(weight);
    if (goalWeight !== undefined) sourceMetadata.goalWeight = Number(goalWeight);

    if (intakeSummary) {
      if (intakeSummary.healthConditions?.length) {
        sourceMetadata.healthConditions = intakeSummary.healthConditions;
      }
      if (intakeSummary.allergies?.length) {
        sourceMetadata.allergies = intakeSummary.allergies;
      }
      if (intakeSummary.medications?.length) {
        sourceMetadata.medications = intakeSummary.medications;
      }
      if (intakeSummary.glp1Type) {
        sourceMetadata.glp1Type = intakeSummary.glp1Type;
      }
      if (intakeSummary.contraindications?.length) {
        sourceMetadata.contraindications = intakeSummary.contraindications;
      }
    }

    const result = await runWithClinicContext(WELLMEDR_CLINIC_ID, () =>
      patientDeduplicationService.resolvePatientForIntake(intakeData, {
        clinicId: WELLMEDR_CLINIC_ID,
        source: 'intake',
        tags: ['wellmedr', 'glp1'],
        notes: 'Created from WellMedR checkout (LEAD)',
        sourceMetadata,
      })
    );

    if (result.isNew) {
      await prisma.patient.update({
        where: { id: result.patient.id },
        data: { profileStatus: 'LEAD' },
      });
    }

    logger.info('[WellMedR] Patient profile created/matched from checkout shipping', {
      patientId: result.patient.id,
      isNew: result.isNew,
      wasMerged: result.wasMerged,
    });

    return NextResponse.json({
      patientId: result.patient.id,
      isNew: result.isNew,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'create-patient-profile' },
    });
    logger.error('[WellMedR] Failed to create patient profile', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'Failed to create patient profile' },
      { status: 500 }
    );
  }
}

export const POST = rateLimit({ max: 10, windowMs: 60_000 })(handler);
