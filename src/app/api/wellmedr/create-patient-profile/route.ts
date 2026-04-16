import { NextRequest, NextResponse } from 'next/server';
import { PatientDocumentCategory } from '@prisma/client';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { runWithClinicContext } from '@/lib/db/clinic-context';
import { patientDeduplicationService, type IntakePatientData } from '@/domains/patient';

const WELLMEDR_CLINIC_ID = parseInt(process.env.WELLMEDR_CLINIC_ID || '7', 10);

const patientProfileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().min(1, 'Phone is required').max(30),
  dob: z.string().min(1, 'Date of birth is required').max(20),
  sex: z.string().min(1, 'Sex is required').max(20),

  shippingAddress: z.object({
    address: z.string().min(1, 'Address is required').max(200),
    apt: z.string().max(50).optional().default(''),
    city: z.string().min(1, 'City is required').max(100),
    state: z.string().min(1, 'State is required').max(50),
    zipCode: z.string().min(1, 'Zip code is required').max(20),
  }),

  weight: z.union([z.string(), z.number()]),
  goalWeight: z.union([z.string(), z.number()]),
  heightFeet: z.union([z.string(), z.number()]).optional(),
  heightInches: z.union([z.string(), z.number()]).optional(),

  intakeSummary: z
    .object({
      healthConditions: z.array(z.string()).optional(),
      allergies: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
      glp1Type: z.string().optional(),
      contraindications: z.array(z.string()).optional(),
    })
    .optional(),

  allIntakeResponses: z.record(z.unknown()).optional(),
});

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = patientProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
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
      heightFeet,
      heightInches,
      intakeSummary,
      allIntakeResponses,
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
      phone,
      dob,
      gender,
      address1: shippingAddress.address,
      address2: shippingAddress.apt || undefined,
      city: shippingAddress.city,
      state: shippingAddress.state,
      zip: shippingAddress.zipCode,
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

    const patientId = result.patient.id;

    // Store full intake responses as a PatientDocument so the Intake tab displays them
    if (allIntakeResponses && Object.keys(allIntakeResponses).length > 0) {
      try {
        const r = allIntakeResponses as Record<string, unknown>;
        const submissionId = `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const sections = buildIntakeSections({
          firstName,
          lastName,
          email,
          phone,
          state: shippingAddress.state,
          dob,
          sex,
          weight: String(weight),
          goalWeight: String(goalWeight),
          heightFeet: heightFeet != null ? String(heightFeet) : undefined,
          heightInches: heightInches != null ? String(heightInches) : undefined,
          shippingAddress,
          responses: r,
          intakeSummary,
        });

        const intakeDataToStore = {
          submissionId,
          sections,
          answers: sections.flatMap((s) => s.entries),
          source: 'wellmedr-checkout',
          clinicId: WELLMEDR_CLINIC_ID,
          receivedAt: new Date().toISOString(),
          checkoutCompleted: false,
          glp1History: {
            usedLast30Days: r.glp1_history_recent ?? '',
            medicationType: r.glp1_type ?? '',
            doseMg: r.glp1_dose ?? '',
          },
        };

        const intakeDataBuffer = Buffer.from(JSON.stringify(intakeDataToStore), 'utf8');

        await prisma.patientDocument.create({
          data: {
            patientId,
            clinicId: WELLMEDR_CLINIC_ID,
            filename: `wellmedr-intake-${submissionId}.json`,
            mimeType: 'application/json',
            category: PatientDocumentCategory.MEDICAL_INTAKE_FORM,
            data: new Uint8Array(intakeDataBuffer),
            source: 'wellmedr-checkout',
            sourceSubmissionId: submissionId,
          },
        });

        logger.info('[WellMedR] Stored intake document for patient', { patientId });
      } catch (docError) {
        logger.error('[WellMedR] Failed to store intake document (non-fatal)', {
          patientId,
          error: docError instanceof Error ? docError.message : 'Unknown',
        });
      }
    }

    logger.info('[WellMedR] Patient profile created/matched from checkout shipping', {
      patientId,
      isNew: result.isNew,
      wasMerged: result.wasMerged,
    });

    return NextResponse.json({
      patientId,
      isNew: result.isNew,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'create-patient-profile' },
    });
    logger.error('[WellMedR] Failed to create patient profile', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Failed to create patient profile' }, { status: 500 });
  }
}

interface SectionEntry {
  id: string;
  label: string;
  value: string;
}
interface IntakeSection {
  title: string;
  entries: SectionEntry[];
}

const LABEL_MAP: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  state: 'State',
  dob: 'Date of Birth',
  sex: 'Sex',
  current_weight: 'Weight (lbs)',
  ideal_weight: 'Goal Weight (lbs)',
  height_feet: 'Height (ft)',
  height_inches: 'Height (in)',
  glp1_history_recent: 'GLP-1 in Last 30 Days',
  glp1_type: 'GLP-1 Type',
  glp1_dose: 'GLP-1 Dose (mg)',
  glp1_type_other: 'Other Medication Name',
  glp1_dose_other: 'Other Dose',
  health_conditions: 'Health Conditions',
  blood_pressure: 'Blood Pressure Range',
  heart_rate: 'Resting Heart Rate',
  opioid_use: 'Opioid Use',
  opioid_use_detail: 'Opioid Details',
  current_medications: 'Current Medications',
  current_medications_detail: 'Medication Details',
  known_allergies: 'Known Allergies',
  known_allergies_detail: 'Allergy Details',
  motivation_level: 'Motivation Level',
  anything_else: 'Additional Info',
  anything_else_detail: 'Additional Details',
  contraindications: 'Contraindications',
  sleep_quality: 'Sleep Quality',
  weight_pace: 'Weight Loss Pace',
  motivation_reason: 'Motivation Reason',
  safety_pregnancy: 'Pregnancy Status',
  surgeries: 'Surgeries',
  surgeries_detail: 'Surgery Details',
  med_priority: 'Medication Priority',
};

function formatValue(val: unknown): string {
  if (val == null || val === '') return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function buildIntakeSections(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  dob: string;
  sex: string;
  weight: string;
  goalWeight: string;
  heightFeet?: string;
  heightInches?: string;
  shippingAddress: { address: string; apt?: string; city: string; state: string; zipCode: string };
  responses: Record<string, unknown>;
  intakeSummary?: {
    healthConditions?: string[];
    allergies?: string[];
    medications?: string[];
    glp1Type?: string;
    contraindications?: string[];
  };
}): IntakeSection[] {
  const {
    firstName,
    lastName,
    email,
    phone,
    state,
    dob,
    sex,
    weight,
    goalWeight,
    heightFeet,
    heightInches,
    shippingAddress,
    responses: r,
  } = params;

  const sections: IntakeSection[] = [];

  // Patient Information
  const patientEntries: SectionEntry[] = [
    { id: 'first-name', label: 'First Name', value: firstName },
    { id: 'last-name', label: 'Last Name', value: lastName },
    { id: 'email', label: 'Email', value: email },
    { id: 'phone', label: 'Phone', value: phone },
    { id: 'state', label: 'State', value: state },
    { id: 'dob', label: 'Date of Birth', value: dob },
    { id: 'sex', label: 'Sex', value: sex },
  ].filter((e) => e.value);
  if (patientEntries.length) sections.push({ title: 'Patient Information', entries: patientEntries });

  // Body Metrics
  const bodyEntries: SectionEntry[] = [];
  if (weight) bodyEntries.push({ id: 'weight', label: 'Weight (lbs)', value: weight });
  if (goalWeight) bodyEntries.push({ id: 'goal-weight', label: 'Goal Weight (lbs)', value: goalWeight });
  if (heightFeet && heightInches != null) {
    bodyEntries.push({ id: 'feet', label: 'Height (ft)', value: heightFeet });
    bodyEntries.push({ id: 'inches', label: 'Height (in)', value: String(heightInches) });
    bodyEntries.push({ id: 'height', label: 'Height', value: `${heightFeet}'${heightInches}"` });
  }
  const bmi = computeBmi(heightFeet, heightInches, weight);
  if (bmi) bodyEntries.push({ id: 'bmi', label: 'BMI', value: bmi });
  if (bodyEntries.length) sections.push({ title: 'Body Metrics', entries: bodyEntries });

  // Shipping Address
  const addrParts = [shippingAddress.address, shippingAddress.apt, shippingAddress.city, shippingAddress.state, shippingAddress.zipCode].filter(Boolean);
  if (addrParts.length) {
    sections.push({
      title: 'Shipping Address',
      entries: [{ id: 'address', label: 'Address', value: addrParts.join(', ') }],
    });
  }

  // Medical History (from raw responses)
  const medicalKeys = ['health_conditions', 'blood_pressure', 'heart_rate', 'opioid_use', 'opioid_use_detail', 'surgeries', 'surgeries_detail', 'safety_pregnancy'];
  const medEntries = medicalKeys
    .filter((k) => r[k] != null && r[k] !== '')
    .map((k) => ({ id: k, label: LABEL_MAP[k] || k, value: formatValue(r[k]) }));
  if (medEntries.length) sections.push({ title: 'Medical History', entries: medEntries });

  // Medication History
  const medKeys = ['glp1_history_recent', 'glp1_type', 'glp1_dose', 'glp1_type_other', 'glp1_dose_other', 'current_medications', 'current_medications_detail'];
  const medRxEntries = medKeys
    .filter((k) => r[k] != null && r[k] !== '')
    .map((k) => ({ id: k, label: LABEL_MAP[k] || k, value: formatValue(r[k]) }));
  if (medRxEntries.length) sections.push({ title: 'Medication History', entries: medRxEntries });

  // Allergies & Risk
  const riskKeys = ['known_allergies', 'known_allergies_detail', 'contraindications'];
  const riskEntries = riskKeys
    .filter((k) => r[k] != null && r[k] !== '')
    .map((k) => ({ id: k, label: LABEL_MAP[k] || k, value: formatValue(r[k]) }));
  if (riskEntries.length) sections.push({ title: 'Allergies & Risk Factors', entries: riskEntries });

  // Lifestyle
  const lifestyleKeys = ['sleep_quality', 'weight_pace', 'motivation_reason', 'motivation_level', 'med_priority'];
  const lifeEntries = lifestyleKeys
    .filter((k) => r[k] != null && r[k] !== '')
    .map((k) => ({ id: k, label: LABEL_MAP[k] || k, value: formatValue(r[k]) }));
  if (lifeEntries.length) sections.push({ title: 'Lifestyle', entries: lifeEntries });

  // Additional Info
  const addlKeys = ['anything_else', 'anything_else_detail'];
  const addlEntries = addlKeys
    .filter((k) => r[k] != null && r[k] !== '')
    .map((k) => ({ id: k, label: LABEL_MAP[k] || k, value: formatValue(r[k]) }));
  if (addlEntries.length) sections.push({ title: 'Additional Information', entries: addlEntries });

  return sections;
}

function computeBmi(
  feet: string | undefined,
  inches: string | undefined,
  weight: string
): string | null {
  const f = Number(feet);
  const i = Number(inches);
  const w = Number(weight);
  if (!f || isNaN(w) || w <= 0) return null;
  const totalInches = f * 12 + (i || 0);
  if (totalInches <= 0) return null;
  const bmi = (w / (totalInches * totalInches)) * 703;
  return bmi.toFixed(1);
}

export const POST = rateLimit({ max: 10, windowMs: 60_000 })(handler);
