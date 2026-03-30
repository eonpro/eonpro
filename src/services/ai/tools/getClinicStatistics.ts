import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_clinic_statistics',
    description:
      'Get aggregate statistics for the current clinic: total patients, orders, providers, today\'s activity, and pending items.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export async function execute(
  _params: Record<string, never>,
  clinicId: number,
): Promise<unknown> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalPatients, totalOrders, totalProviders, todayPatients, pendingOrders, recentIntakes] =
    await Promise.all([
      prisma.patient.count({ where: { clinicId } }),
      prisma.order.count({ where: { patient: { clinicId } } }),
      prisma.provider.count({
        where: {
          OR: [{ clinicId }, { providerClinics: { some: { clinicId } } }],
        },
      }),
      prisma.patient.count({ where: { clinicId, createdAt: { gte: today } } }),
      prisma.order.count({ where: { status: 'PENDING', patient: { clinicId } } }),
      prisma.patientDocument.count({
        where: { clinicId, createdAt: { gte: today }, category: 'MEDICAL_INTAKE_FORM' },
      }),
    ]);

  return {
    totalPatients,
    totalOrders,
    totalProviders,
    today: {
      newPatients: todayPatients,
      newIntakes: recentIntakes,
    },
    pending: {
      orders: pendingOrders,
    },
  };
}
