/**
 * Patient Refill Queue Item API (edit / delete prepaid shipment)
 *
 * PATCH /api/patients/[id]/refill-queue/[refillId] - Update refill (date, plan/medication name)
 * DELETE /api/patients/[id]/refill-queue/[refillId] - Cancel refill
 *
 * @security Admin, Super Admin, or Provider (clinic access)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { updateRefill, cancelRefill } from '@/services/refill/refillQueueService';
import { handleApiError } from '@/domains/shared/errors';

type Params = { params: Promise<{ id: string; refillId: string }> };

async function getRefillAndVerify(
  patientId: number,
  refillId: number,
  user: { role: string; clinicId: number | null }
) {
  const refill = await prisma.refillQueue.findUnique({
    where: { id: refillId },
    select: { id: true, patientId: true, clinicId: true },
  });
  if (!refill || refill.patientId !== patientId) return null;
  const patient = { id: refill.patientId, clinicId: refill.clinicId };
  if (ensureTenantResource(patient, user.role === 'super_admin' ? undefined : user.clinicId ?? undefined)) return null;
  return refill;
}

const PATCH = withAuthParams(
  async (request: NextRequest, user: any, { params }: Params) => {
    try {
      const { id, refillId: refillIdStr } = await params;
      const patientId = parseInt(id, 10);
      const refillId = parseInt(refillIdStr, 10);
      if (isNaN(patientId) || isNaN(refillId)) {
        return NextResponse.json({ error: 'Invalid patient or refill ID' }, { status: 400 });
      }

      const refill = await getRefillAndVerify(patientId, refillId, user);
      if (!refill) return tenantNotFoundResponse();

      const body = await request.json();
      const nextRefillDate = body.nextRefillDate ? new Date(body.nextRefillDate) : undefined;
      const updated = await updateRefill(refillId, {
        nextRefillDate,
        planName: body.planName,
        medicationName: body.medicationName,
        medicationStrength: body.medicationStrength,
        medicationForm: body.medicationForm,
      });

      return NextResponse.json({ refill: updated });
    } catch (error) {
      return handleApiError(error, { route: 'PATCH /api/patients/[id]/refill-queue/[refillId]' });
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);

const DELETE = withAuthParams(
  async (request: NextRequest, user: any, { params }: Params) => {
    try {
      const { id, refillId: refillIdStr } = await params;
      const patientId = parseInt(id, 10);
      const refillId = parseInt(refillIdStr, 10);
      if (isNaN(patientId) || isNaN(refillId)) {
        return NextResponse.json({ error: 'Invalid patient or refill ID' }, { status: 400 });
      }

      const refill = await getRefillAndVerify(patientId, refillId, user);
      if (!refill) return tenantNotFoundResponse();

      const reason = (await request.json().catch(() => ({}))).reason || 'Deleted from patient billing';
      const updated = await cancelRefill(refillId, reason);

      return NextResponse.json({ refill: updated });
    } catch (error) {
      return handleApiError(error, { route: 'DELETE /api/patients/[id]/refill-queue/[refillId]' });
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);

export { PATCH, DELETE };
