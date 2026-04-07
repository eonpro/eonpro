import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_tracking_info',
    description:
      'Get shipping and tracking details for a patient\'s orders. Shows carrier, tracking number, status, and estimated delivery.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'number', description: 'The patient ID' },
      },
      required: ['patientId'],
    },
  },
};

export async function execute(
  params: { patientId: number },
  clinicId: number,
): Promise<unknown> {
  const verified = await prisma.patient.findFirst({
    where: { id: params.patientId, clinicId },
    select: { id: true },
  });
  if (!verified) return { found: false, message: 'Patient not found in this clinic.' };

  const [orders, shippingUpdates] = await Promise.all([
    prisma.order.findMany({
      where: { patientId: params.patientId, trackingNumber: { not: null } },
      select: {
        id: true,
        primaryMedName: true,
        status: true,
        shippingStatus: true,
        trackingNumber: true,
        trackingUrl: true,
        createdAt: true,
        rxs: { select: { medName: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    (prisma as any).shippingUpdate.findMany({
      where: { patientId: params.patientId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        trackingNumber: true,
        carrier: true,
        status: true,
        statusDetail: true,
        estimatedDelivery: true,
        deliveredAt: true,
        lastUpdatedAt: true,
      },
    }),
  ]);

  if (orders.length === 0 && shippingUpdates.length === 0) {
    return { found: true, tracking: [], message: 'No tracking information available for this patient.' };
  }

  return {
    found: true,
    orders: orders.map((o: any) => ({
      orderId: o.id,
      medication: o.primaryMedName || o.rxs[0]?.medName || 'Unknown',
      status: o.status,
      shippingStatus: o.shippingStatus,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      orderDate: o.createdAt.toISOString(),
    })),
    shippingUpdates: shippingUpdates.map((s: any) => ({
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      status: s.status,
      detail: s.statusDetail,
      estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      lastUpdate: s.lastUpdatedAt.toISOString(),
    })),
  };
}
