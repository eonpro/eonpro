/**
 * Superbills API
 * 
 * CRUD operations for superbills (insurance claim forms)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import {
  createSuperbill,
  finalizeSuperbill,
  generateSuperbillPDF,
  getPatientSuperbills,
  markSuperbillSent,
  recordSuperbillPayment,
  searchBillingCodes,
} from '@/lib/billing/superbill.service';
import { prisma } from '@/lib/db';

const createSuperbillSchema = z.object({
  clinicId: z.number().optional(),
  patientId: z.number(),
  providerId: z.number(),
  appointmentId: z.number().optional(),
  serviceDate: z.string().datetime(),
  items: z.array(z.object({
    cptCode: z.string(),
    cptDescription: z.string(),
    icdCodes: z.array(z.string()),
    icdDescriptions: z.array(z.string()),
    modifier: z.string().optional(),
    units: z.number().default(1),
    unitPrice: z.number(),
  })),
  notes: z.string().optional(),
});

// Properly typed parsed data
type CreateSuperbillData = z.infer<typeof createSuperbillSchema>;

/**
 * GET /api/billing/superbills
 * List superbills with filters
 */
export const GET = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const searchParams = req.nextUrl.searchParams;
      const patientId = searchParams.get('patientId');
      const superbillId = searchParams.get('superbillId');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const status = searchParams.get('status');
      const format = searchParams.get('format');

      // If requesting a specific superbill PDF
      if (superbillId && format === 'pdf') {
        const result = await generateSuperbillPDF(parseInt(superbillId));

        if (!result.success || !result.buffer) {
          return NextResponse.json(
            { error: result.error || 'Failed to generate PDF' },
            { status: 400 }
          );
        }

        return new NextResponse(new Uint8Array(result.buffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="superbill-${superbillId}.pdf"`,
          },
        });
      }

      // If requesting a specific superbill
      if (superbillId) {
        const superbill = await prisma.superbill.findUnique({
          where: { id: parseInt(superbillId) },
          include: {
            items: true,
            patient: true,
            provider: true,
            appointment: true,
          },
        });

        if (!superbill) {
          return NextResponse.json(
            { error: 'Superbill not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ superbill });
      }

      // List superbills for a patient
      if (!patientId) {
        return NextResponse.json(
          { error: 'patientId is required' },
          { status: 400 }
        );
      }

      const superbills = await getPatientSuperbills(parseInt(patientId), {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: status || undefined,
      });

      return NextResponse.json({ superbills });
    } catch (error) {
      logger.error('Failed to fetch superbills', { error });
      return NextResponse.json(
        { error: 'Failed to fetch superbills' },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/billing/superbills
 * Create a new superbill
 */
export const POST = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const parsed = createSuperbillSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request data', details: parsed.error.issues },
          { status: 400 }
        );
      }

      const result = await createSuperbill({
        clinicId: parsed.data.clinicId,
        patientId: parsed.data.patientId,
        providerId: parsed.data.providerId,
        appointmentId: parsed.data.appointmentId,
        serviceDate: new Date(parsed.data.serviceDate),
        notes: parsed.data.notes,
        items: parsed.data.items.map(item => ({
          cptCode: item.cptCode,
          cptDescription: item.cptDescription,
          icdCodes: item.icdCodes,
          icdDescriptions: item.icdDescriptions,
          modifier: item.modifier,
          units: item.units,
          unitPrice: item.unitPrice,
        })),
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ superbill: result.superbill }, { status: 201 });
    } catch (error) {
      logger.error('Failed to create superbill', { error });
      return NextResponse.json(
        { error: 'Failed to create superbill' },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/billing/superbills
 * Update superbill (finalize, mark sent, record payment)
 */
export const PATCH = withProviderAuth(
  async (req: NextRequest, user) => {
    try {
      const body = await req.json();
      const { superbillId, action, amount } = body;

      if (!superbillId || !action) {
        return NextResponse.json(
          { error: 'superbillId and action are required' },
          { status: 400 }
        );
      }

      let result;

      switch (action) {
        case 'finalize':
          result = await finalizeSuperbill(superbillId);
          break;
        case 'markSent':
          result = await markSuperbillSent(superbillId);
          break;
        case 'recordPayment':
          if (!amount) {
            return NextResponse.json(
              { error: 'amount is required for recordPayment action' },
              { status: 400 }
            );
          }
          result = await recordSuperbillPayment(superbillId, amount);
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
          );
      }

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ superbill: result.superbill });
    } catch (error) {
      logger.error('Failed to update superbill', { error });
      return NextResponse.json(
        { error: 'Failed to update superbill' },
        { status: 500 }
      );
    }
  }
);
