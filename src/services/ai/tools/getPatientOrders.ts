import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_patient_orders',
    description:
      'Get orders for a specific patient including status, medications, tracking numbers, and shipping info.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'number', description: 'The patient ID' },
        limit: { type: 'number', description: 'Max orders to return (default 5)' },
      },
      required: ['patientId'],
    },
  },
};

export async function execute(
  params: { patientId: number; limit?: number },
  clinicId: number
): Promise<unknown> {
  const verified = await prisma.patient.findFirst({
    where: { id: params.patientId, clinicId },
    select: { id: true },
  });
  if (!verified) return { found: false, message: 'Patient not found in this clinic.' };

  const orders = await prisma.order.findMany({
    where: { patientId: params.patientId },
    include: {
      rxs: {
        select: {
          medName: true,
          strength: true,
          form: true,
          quantity: true,
          sig: true,
          daysSupply: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 5,
  });

  if (orders.length === 0) {
    return { found: true, orders: [], message: 'No orders found for this patient.' };
  }

  return {
    found: true,
    count: orders.length,
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      shippingStatus: o.shippingStatus,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      medication: o.primaryMedName || o.rxs[0]?.medName || 'Unknown',
      prescriptions: o.rxs.map((rx) => ({
        medication: rx.medName,
        strength: rx.strength,
        form: rx.form,
        quantity: rx.quantity,
        directions: rx.sig,
        daysSupply: rx.daysSupply,
      })),
      createdAt: o.createdAt.toISOString(),
    })),
  };
}
