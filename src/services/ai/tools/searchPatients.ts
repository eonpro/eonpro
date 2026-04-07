import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_patients',
    description:
      'Search for patients by name, date of birth, email, or phone number within the current clinic. Returns top 5 matching patients with basic info.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — patient name, DOB (MM/DD/YYYY), email, or phone number',
        },
      },
      required: ['query'],
    },
  },
};

export async function execute(
  params: { query: string },
  clinicId: number,
): Promise<unknown> {
  const q = params.query.trim();

  const isEmail = q.includes('@');
  const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(q);
  const isDob = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(q);

  let patients;

  if (isEmail) {
    patients = await prisma.patient.findMany({
      where: { clinicId, email: { contains: q, mode: 'insensitive' as const } },
      select: patientSelect,
      take: 5,
    });
  } else if (isPhone) {
    const digits = q.replace(/\D/g, '');
    patients = await prisma.patient.findMany({
      where: { clinicId, phone: { contains: digits } },
      select: patientSelect,
      take: 5,
    });
  } else if (isDob) {
    patients = await prisma.patient.findMany({
      where: { clinicId, dob: q },
      select: patientSelect,
      take: 5,
    });
  } else {
    const parts = q.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    patients = await prisma.patient.findMany({
      where: {
        clinicId,
        OR: [
          {
            AND: [
              { firstName: { contains: firstName, mode: 'insensitive' as const } },
              ...(lastName
                ? [{ lastName: { contains: lastName, mode: 'insensitive' as const } }]
                : []),
            ],
          },
          ...(lastName
            ? [
                {
                  AND: [
                    { firstName: { contains: lastName, mode: 'insensitive' as const } },
                    { lastName: { contains: firstName, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
          { firstName: { contains: q, mode: 'insensitive' as const } },
          { lastName: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      select: patientSelect,
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
  }

  if (patients.length === 0) {
    return { found: false, message: `No patients found matching "${q}".` };
  }

  return {
    found: true,
    count: patients.length,
    patients: patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      dob: p.dob,
      email: p.email,
      phone: p.phone,
      gender: p.gender,
    })),
  };
}

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  dob: true,
  email: true,
  phone: true,
  gender: true,
} as const;
