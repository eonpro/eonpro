import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_patient_prescriptions',
    description:
      'Get all prescriptions (current and historical) for a patient. Shows medication names, strengths, directions, and order dates.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'number', description: 'The patient ID' },
        limit: { type: 'number', description: 'Max prescriptions to return (default 10)' },
      },
      required: ['patientId'],
    },
  },
};

export async function execute(
  params: { patientId: number; limit?: number },
  clinicId: number,
): Promise<unknown> {
  const verified = await prisma.patient.findFirst({
    where: { id: params.patientId, clinicId },
    select: { id: true },
  });
  if (!verified) return { found: false, message: 'Patient not found in this clinic.' };

  const rxs = await prisma.rx.findMany({
    where: { order: { patientId: params.patientId } },
    include: {
      order: {
        select: { id: true, status: true, createdAt: true, shippingStatus: true },
      },
    },
    orderBy: { order: { createdAt: 'desc' } },
    take: params.limit ?? 10,
  });

  if (rxs.length === 0) {
    return { found: true, prescriptions: [], message: 'No prescriptions found for this patient.' };
  }

  return {
    found: true,
    count: rxs.length,
    prescriptions: rxs.map((rx) => ({
      medication: rx.medName,
      strength: rx.strength,
      form: rx.form,
      quantity: rx.quantity,
      directions: rx.sig,
      daysSupply: rx.daysSupply,
      orderId: rx.order.id,
      orderStatus: rx.order.status,
      shippingStatus: rx.order.shippingStatus,
      prescribedAt: rx.order.createdAt.toISOString(),
    })),
  };
}
