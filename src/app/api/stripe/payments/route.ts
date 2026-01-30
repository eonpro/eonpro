import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Schema for creating a payment
const createPaymentSchema = z.object({
  patientId: z.number().positive('Patient ID must be positive'),
  amount: z.number().min(50, 'Minimum amount is 50 cents'), // Minimum 50 cents
  description: z.string().max(500).optional(),
  invoiceId: z.number().positive().optional(),
  paymentMethodId: z.string().min(1).optional(),
  metadata: z.record(z.string()).optional(),
});

// Type for validated payment data
type CreatePaymentData = z.infer<typeof createPaymentSchema>;

export async function POST(request: NextRequest) {
  try {
    // Dynamic import to avoid build-time errors
    const { StripePaymentService } = await import('@/services/stripe/paymentService');

    const body = await request.json();

    // Validate request body with safeParse for better error handling
    const validationResult = createPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payment data', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const validatedData: CreatePaymentData = validationResult.data;
    
    // Create payment intent or process payment
    if (validatedData.paymentMethodId) {
      // Process payment immediately with saved payment method
      const payment = await StripePaymentService.processPayment(validatedData);
      
      return NextResponse.json({
        success: true,
        payment,
      });
    } else {
      // Create payment intent for client-side confirmation
      const result = await StripePaymentService.createPaymentIntent(validatedData);
      
      return NextResponse.json({
        success: true,
        payment: result.payment,
        clientSecret: result.clientSecret,
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error creating payment:', error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json(
      { error: 'Failed to create payment', message: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Dynamic import to avoid build-time errors
    const { StripePaymentService } = await import('@/services/stripe/paymentService');
    
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    // Get patient payments
    const payments = await StripePaymentService.getPatientPayments(
      parseInt(patientId, 10)
    );
    
    return NextResponse.json({
      success: true,
      payments,
    });
  } catch (error: unknown) {
    logger.error('[API] Error fetching payments:', error instanceof Error ? error : new Error(String(error)));
    
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
