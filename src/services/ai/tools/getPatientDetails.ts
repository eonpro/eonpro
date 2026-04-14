import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_patient_details',
    description:
      'Get full details for a specific patient including demographics, vitals, allergies, and current medications. Requires patient ID.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'number', description: 'The patient ID' },
      },
      required: ['patientId'],
    },
  },
};

export async function execute(params: { patientId: number }, clinicId: number): Promise<unknown> {
  const patient = await prisma.patient.findFirst({
    where: { id: params.patientId, clinicId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dob: true,
      gender: true,
      phone: true,
      email: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      zip: true,
      notes: true,
      weightLogs: {
        orderBy: { recordedAt: 'desc' },
        take: 5,
        select: { weight: true, unit: true, recordedAt: true },
      },
      documents: {
        where: { category: 'MEDICAL_INTAKE_FORM' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { data: true },
      },
    },
  });

  if (!patient) {
    return { found: false, message: 'Patient not found in this clinic.' };
  }

  let age: number | null = null;
  let formattedDob = patient.dob;
  if (patient.dob) {
    try {
      const parts = patient.dob.split('/');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        formattedDob = d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
    } catch {
      /* keep raw dob */
    }
  }

  const intakeVitals = extractIntakeVitals(patient.documents?.[0]?.data);

  return {
    found: true,
    patient: {
      id: patient.id,
      name: `${patient.firstName} ${patient.lastName}`,
      dob: formattedDob,
      age,
      gender: patient.gender,
      phone: patient.phone,
      email: patient.email,
      address: [
        patient.address1,
        patient.address2,
        `${patient.city}, ${patient.state} ${patient.zip}`,
      ]
        .filter(Boolean)
        .join(', '),
    },
    vitals: {
      latestWeight: patient.weightLogs[0]
        ? {
            weight: patient.weightLogs[0].weight,
            unit: patient.weightLogs[0].unit,
            date: patient.weightLogs[0].recordedAt,
          }
        : null,
      weightHistory: patient.weightLogs.map((w) => ({
        weight: w.weight,
        unit: w.unit,
        date: w.recordedAt,
      })),
      fromIntake: intakeVitals,
    },
  };
}

function extractIntakeVitals(data: unknown): Record<string, string | null> {
  const vitals: Record<string, string | null> = {
    height: null,
    weight: null,
    bmi: null,
    bloodPressure: null,
  };
  if (!data) return vitals;

  try {
    let parsed: any;
    if (Buffer.isBuffer(data)) parsed = JSON.parse(data.toString('utf8'));
    else if (typeof data === 'string') parsed = JSON.parse(data);
    else parsed = data;

    const labels: Record<string, string[]> = {
      height: ['height'],
      weight: ['starting weight', 'current weight', 'weight'],
      bmi: ['bmi'],
      bloodPressure: ['blood pressure'],
    };

    if (parsed.sections && Array.isArray(parsed.sections)) {
      for (const section of parsed.sections) {
        if (!section.fields) continue;
        for (const field of section.fields) {
          const fl = (field.label || '').toLowerCase();
          for (const [key, aliases] of Object.entries(labels)) {
            if (!vitals[key] && aliases.some((a) => fl.includes(a)) && field.value) {
              vitals[key] = String(field.value);
            }
          }
        }
      }
    }
  } catch {
    /* non-critical */
  }

  return vitals;
}
