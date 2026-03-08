import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { clinicInvoiceService, platformFeeService } from '@/services/billing';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const batchSchema = z.object({
  periodType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  periodStart: z.string().transform((v) => new Date(v)),
  periodEnd: z.string().transform((v) => new Date(v)),
  clinicIds: z.array(z.number().int().positive()).optional(),
  createStripeInvoice: z.boolean().optional().default(false),
});

interface BatchResult {
  clinicId: number;
  clinicName: string;
  status: 'created' | 'skipped' | 'error';
  invoiceId?: number;
  invoiceNumber?: string;
  totalAmountCents?: number;
  feeCount?: number;
  reason?: string;
}

/**
 * POST /api/super-admin/clinic-invoices/batch
 * Generate invoices for multiple clinics at once.
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = batchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { periodType, periodStart, periodEnd, clinicIds, createStripeInvoice } = parsed.data;

    const allConfigs = await platformFeeService.getAllFeeConfigs();
    const configs = clinicIds
      ? allConfigs.filter((c) => clinicIds.includes(c.clinicId))
      : allConfigs;

    const results: BatchResult[] = [];

    for (const config of configs) {
      if (!config.isActive) {
        results.push({
          clinicId: config.clinicId,
          clinicName: config.clinic?.name ?? `Clinic #${config.clinicId}`,
          status: 'skipped',
          reason: 'Billing inactive',
        });
        continue;
      }

      try {
        const preview = await clinicInvoiceService.previewPendingFees(
          config.clinicId,
          periodStart,
          periodEnd
        );

        if (preview.feeCount === 0) {
          results.push({
            clinicId: config.clinicId,
            clinicName: config.clinic?.name ?? `Clinic #${config.clinicId}`,
            status: 'skipped',
            reason: 'No pending fees',
          });
          continue;
        }

        let invoice = await clinicInvoiceService.generateInvoice({
          clinicId: config.clinicId,
          periodType,
          periodStart,
          periodEnd,
          actorId: user.id,
        });

        if (createStripeInvoice) {
          try {
            invoice = await clinicInvoiceService.createStripeInvoice(invoice.id);
          } catch (stripeErr) {
            logger.warn('[BatchInvoice] Stripe invoice creation failed', {
              invoiceId: invoice.id,
              clinicId: config.clinicId,
              error: stripeErr instanceof Error ? stripeErr.message : 'Unknown',
            });
          }
        }

        results.push({
          clinicId: config.clinicId,
          clinicName: config.clinic?.name ?? `Clinic #${config.clinicId}`,
          status: 'created',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmountCents: invoice.totalAmountCents,
          feeCount: preview.feeCount,
        });
      } catch (err) {
        results.push({
          clinicId: config.clinicId,
          clinicName: config.clinic?.name ?? `Clinic #${config.clinicId}`,
          status: 'error',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
      totalAmountCents: results
        .filter((r) => r.status === 'created')
        .reduce((s, r) => s + (r.totalAmountCents ?? 0), 0),
    };

    logger.info('[SuperAdmin] Batch invoice generation completed', {
      ...summary,
      generatedBy: user.id,
    });

    return NextResponse.json({ summary, results });
  } catch (error) {
    logger.error('[SuperAdmin] Batch invoice error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Batch invoice generation failed' }, { status: 500 });
  }
});
