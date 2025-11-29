import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Schema for creating a payment
const createPaymentSchema = z.object({
  patientId: z.number(),
  amount: z.number().min(50), // Minimum 50 cents
  description: z.string().optional(),
  invoiceId: z.number().optional(),
  paymentMethodId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Dynamic import to avoid build-time errors
    const { StripePaymentService } = await import('@/services/stripe/paymentService');
    
    const body = await request.json();
    
    // Validate request body
    const validatedData = createPaymentSchema.parse(body);
    
    // Create payment intent or process payment
    if (validatedData.paymentMethodId) {
      // Process payment immediately with saved payment method
      const payment = await StripePaymentService.processPayment(validatedData as any);
      
      return NextResponse.json({
        success: true,
        payment,
      });
    } else {
      // Create payment intent for client-side confirmation
      const result = await StripePaymentService.createPaymentIntent(validatedData as any);
      
      return NextResponse.json({
        success: true,
        payment: result.payment,
        clientSecret: result.clientSecret,
      });
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[API] Error creating payment:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create payment' },
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
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[API] Error fetching payments:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
