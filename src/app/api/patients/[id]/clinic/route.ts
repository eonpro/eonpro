/**
 * PATCH /api/patients/[id]/clinic
 *
 * Reassign a patient to a different clinic. Super-admin only.
 * Use when a patient was created under the wrong clinic (e.g. should be Eonmeds).
 * Updates Patient.clinicId and Order.clinicId for that patient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { basePrisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const bodySchema = z.object({
  clinicId: z.number().int().positive('clinicId must be a positive integer'),
});

type Params = { params: Promise<{ id: string }> };

const patchHandler = withAuthParams(
  async (req: NextRequest, user: AuthUser, { params }: Params) => {
    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can reassign a patient to another clinic.' },
        { status: 403 }
      );
    }

    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id, 10);
    if (isNaN(patientId) || patientId <= 0) {
      return NextResponse.json({ error: 'Invalid patient id' }, { status: 400 });
    }

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await req.json());
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid body', details: e instanceof z.ZodError ? e.flatten() : null },
        { status: 400 }
      );
    }

    const targetClinicId = body.clinicId;

    try {
      // Use basePrisma to avoid clinic filter (super_admin operation)
      const clinic = await basePrisma.clinic.findUnique({
        where: { id: targetClinicId },
        select: { id: true, name: true, subdomain: true },
      });
      if (!clinic) {
        return NextResponse.json(
          { error: `Clinic with id ${targetClinicId} not found.` },
          { status: 404 }
        );
      }

      const patient = await basePrisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true, patientId: true },
      });
      if (!patient) {
        return NextResponse.json(
          { error: `Patient with id ${patientId} not found.` },
          { status: 404 }
        );
      }

      if (patient.clinicId === targetClinicId) {
        return NextResponse.json({
          message: 'Patient is already assigned to this clinic.',
          patientId,
          clinicId: targetClinicId,
        });
      }

      // Check unique (clinicId, patientId) - avoid duplicate patientId in target clinic
      if (patient.patientId) {
        const existing = await basePrisma.patient.findFirst({
          where: {
            clinicId: targetClinicId,
            patientId: patient.patientId,
            id: { not: patientId },
          },
        });
        if (existing) {
          return NextResponse.json(
            {
              error: `Target clinic already has a patient with patientId "${patient.patientId}". Resolve duplicate before reassigning.`,
            },
            { status: 409 }
          );
        }
      }

      await basePrisma.$transaction(async (tx) => {
        await tx.patient.update({
          where: { id: patientId },
          data: { clinicId: targetClinicId },
        });
        await tx.order.updateMany({
          where: { patientId },
          data: { clinicId: targetClinicId },
        });
      }, { timeout: 15000 });

      logger.info('Patient reassigned to clinic', {
        patientId,
        previousClinicId: patient.clinicId,
        newClinicId: targetClinicId,
        clinicName: clinic.name,
        userId: user.id,
        userEmail: user.email,
      });

      return NextResponse.json({
        message: 'Patient reassigned to clinic.',
        patientId,
        clinicId: targetClinicId,
        clinicName: clinic.name,
      });
    } catch (e) {
      logger.error('Failed to reassign patient to clinic', {
        patientId,
        targetClinicId,
        error: e instanceof Error ? e.message : String(e),
      });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to reassign patient.' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin'] }
);

export const PATCH = patchHandler;
