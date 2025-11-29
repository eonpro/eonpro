import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentMethodService } from '@/services/paymentMethodService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

// Schema for adding a new card
const AddCardSchema = z.object({
  patientId: z.number(),
  cardNumber: z.string().min(13).max(19),
  expiryMonth: z.number().min(1).max(12),
  expiryYear: z.number().min(new Date().getFullYear()),
  cvv: z.string().min(3).max(4).optional(),
  cardholderName: z.string().min(1),
  billingZip: z.string().min(5),
  setAsDefault: z.boolean().optional().default(false)
});

// GET /api/payment-methods?patientId=123
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const cards = await PaymentMethodService.getPaymentMethods(parseInt(patientId));

    return NextResponse.json({
      success: true,
      data: cards
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[PAYMENT_METHODS] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment methods' },
      { status: 500 }
    );
  }
}

// POST /api/payment-methods
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validationResult = AddCardSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Add the payment method
    const paymentMethod = await PaymentMethodService.addPaymentMethod(
      data.patientId,
      {
        cardNumber: data.cardNumber.replace(/\s/g, ''), // Remove spaces
        expiryMonth: data.expiryMonth,
        expiryYear: data.expiryYear,
        cvv: data.cvv,
        cardholderName: data.cardholderName,
        billingZip: data.billingZip
      },
      data.setAsDefault
    );

    // Return safe data only
    return NextResponse.json({
      success: true,
      data: {
        id: paymentMethod.id,
        last4: paymentMethod.cardLast4,
        brand: paymentMethod.cardBrand,
        expiryMonth: paymentMethod.expiryMonth,
        expiryYear: paymentMethod.expiryYear,
        cardholderName: paymentMethod.cardholderName,
        isDefault: paymentMethod.isDefault
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS] POST error:', error);
    
    // Handle specific errors
    if (errorMessage === 'Invalid card number') {
      return NextResponse.json(
        { error: 'Invalid card number' },
        { status: 400 }
      );
    }
    
    if (error.message === 'Card has expired') {
      return NextResponse.json(
        { error: 'Card has expired' },
        { status: 400 }
      );
    }
    
    if (error.message === 'This card is already saved') {
      return NextResponse.json(
        { error: 'This card is already saved' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to add payment method' },
      { status: 500 }
    );
  }
}

// DELETE /api/payment-methods?id=123&patientId=456
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const patientId = searchParams.get('patientId');

    if (!id || !patientId) {
      return NextResponse.json(
        { error: 'ID and Patient ID are required' },
        { status: 400 }
      );
    }

    await PaymentMethodService.removePaymentMethod(
      parseInt(id),
      parseInt(patientId)
    );

    return NextResponse.json({
      success: true,
      message: 'Payment method removed successfully'
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PAYMENT_METHODS] DELETE error:', error);
    
    if (errorMessage === 'Payment method not found') {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to remove payment method' },
      { status: 500 }
    );
  }
}
