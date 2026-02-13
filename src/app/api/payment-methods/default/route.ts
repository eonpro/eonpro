import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodService } from '@/services/paymentMethodService';
import { logger } from '@/lib/logger';

const SetDefaultSchema = z.object({
  paymentMethodId: z.number(),
  patientId: z.number(),
});

// PUT /api/payment-methods/default
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validationResult = SetDefaultSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { paymentMethodId, patientId } = validationResult.data;

    await PaymentMethodService.setDefaultPaymentMethod(paymentMethodId, patientId);

    return NextResponse.json({
      success: true,
      message: 'Default payment method updated',
    });
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS_DEFAULT] PUT error:', error);

    if (errorMessage === 'Payment method not found') {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to update default payment method' }, { status: 500 });
  }
}
