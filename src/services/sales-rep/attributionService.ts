/**
 * Sales Rep Attribution Service
 *
 * When a patient completes intake with a sales rep ref code:
 * - Assign the patient to that sales rep (PatientSalesRepAssignment)
 * - Mark the most recent unconverted SalesRepTouch for that ref code as converted
 */

import { prisma, runWithClinicContext, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface SalesRepAttributionResult {
  success: boolean;
  salesRepId: number;
  refCode: string;
  touchId?: number;
}

/**
 * Attribute a patient to a sales rep from intake (promo/ref code).
 * Call this when an intake is completed with a ref code that might belong to a sales rep.
 *
 * @returns Result if attribution was done, null if no matching sales rep ref code
 */
export async function attributeFromIntakeSalesRep(
  patientId: number,
  promoCode: string,
  clinicId: number,
  _source: string = 'intake'
): Promise<SalesRepAttributionResult | null> {
  const refCodeNorm = promoCode.trim().toUpperCase();
  if (!refCodeNorm) return null;

  try {
    const refCodeRecord = await basePrisma.salesRepRefCode.findFirst({
      where: {
        clinicId,
        refCode: refCodeNorm,
        isActive: true,
      },
      select: { id: true, salesRepId: true, refCode: true },
    });

    if (!refCodeRecord) {
      return null;
    }

    const { salesRepId, refCode } = refCodeRecord;

    const result = await runWithClinicContext(clinicId, async () => {
      // 1) Ensure patient is assigned to this sales rep (idempotent)
      const existing = await prisma.patientSalesRepAssignment.findFirst({
        where: {
          patientId,
          clinicId,
          isActive: true,
        },
      });

      if (!existing) {
        await prisma.patientSalesRepAssignment.create({
          data: {
            patientId,
            clinicId,
            salesRepId,
            isActive: true,
          },
        });
      } else if (existing.salesRepId !== salesRepId) {
        await prisma.patientSalesRepAssignment.updateMany({
          where: { patientId, clinicId, isActive: true },
          data: { isActive: false, removedAt: new Date() },
        });
        await prisma.patientSalesRepAssignment.create({
          data: {
            patientId,
            clinicId,
            salesRepId,
            isActive: true,
          },
        });
      }

      // 2) Mark the most recent unconverted touch for this ref code as converted
      const touch = await prisma.salesRepTouch.findFirst({
        where: {
          clinicId,
          salesRepId,
          refCode,
          convertedPatientId: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (touch) {
        await prisma.salesRepTouch.update({
          where: { id: touch.id },
          data: {
            convertedPatientId: patientId,
            convertedAt: new Date(),
          },
        });
      }

      return { touchId: touch?.id };
    });

    logger.info('[SalesRep Attribution] Patient attributed from intake', {
      patientId,
      salesRepId,
      refCode,
      clinicId,
      touchId: result.touchId,
    });

    return {
      success: true,
      salesRepId,
      refCode,
      touchId: result.touchId,
    };
  } catch (error) {
    logger.warn('[SalesRep Attribution] Failed', {
      patientId,
      refCode: refCodeNorm,
      clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
