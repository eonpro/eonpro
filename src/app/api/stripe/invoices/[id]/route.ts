import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    // Dynamic import to avoid build-time errors
    const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
    
    const invoiceId = parseInt(resolvedParams.id, 10);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }
    
    const invoice = await StripeInvoiceService.getInvoice(invoiceId);
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[API] Error fetching invoice:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    // Dynamic import to avoid build-time errors
    const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
    
    const invoiceId = parseInt(resolvedParams.id, 10);
    const { action } = await request.json();
    
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }
    
    switch (action) {
      case 'send':
        await StripeInvoiceService.sendInvoice(invoiceId);
        break;
      case 'void':
        await StripeInvoiceService.voidInvoice(invoiceId);
        break;
      case 'markUncollectible':
        await StripeInvoiceService.markUncollectible(invoiceId);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({
      success: true,
      message: `Invoice ${action} successful`,
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error(`[API] Error performing invoice action:`, error);
    
    return NextResponse.json(
      { error: 'Failed to perform invoice action' },
      { status: 500 }
    );
  }
}
