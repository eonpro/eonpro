/**
 * INVOICE LINK SMS SENDER
 * =======================
 * Create invoices and send payment links to patients via SMS (Twilio)
 * 
 * POST /api/invoices/send-link
 * 
 * Features:
 * - Creates invoice in Stripe (if not exists)
 * - Gets hosted payment URL
 * - Sends link via SMS using Twilio
 * - Supports email fallback
 * - Tracks delivery status
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { sendEmail } from '@/lib/email';
import { standardRateLimit } from '@/lib/rateLimit';

// Request schema
const sendInvoiceLinkSchema = z.object({
  // Either invoiceId OR create new invoice
  invoiceId: z.number().optional(),
  
  // For creating new invoice
  patientId: z.number().optional(),
  description: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number().min(100), // Min $1.00
    quantity: z.number().optional(),
  })).optional(),
  dueInDays: z.number().min(1).max(90).default(30),
  
  // Delivery options
  sendMethod: z.enum(['sms', 'email', 'both']).default('sms'),
  customMessage: z.string().max(500).optional(),
});

// SMS Templates
const SMS_TEMPLATES = {
  invoice: (clinicName: string, amount: string, link: string) =>
    `${clinicName}: Your invoice for ${amount} is ready. Pay securely here: ${link}`,
  
  invoiceWithMessage: (clinicName: string, amount: string, link: string, message: string) =>
    `${clinicName}: ${message}\n\nInvoice: ${amount}\nPay here: ${link}`,
  
  reminder: (clinicName: string, amount: string, dueDate: string, link: string) =>
    `${clinicName}: Reminder - Your ${amount} payment is due ${dueDate}. Pay now: ${link}`,
};

async function sendInvoiceLinkHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const validated = sendInvoiceLinkSchema.parse(body);
    
    let invoice: any;
    let paymentUrl: string | null = null;
    let patient: any;
    
    // Get or create invoice
    if (validated.invoiceId) {
      // Use existing invoice
      invoice = await prisma.invoice.findUnique({
        where: { id: validated.invoiceId },
        include: { patient: true },
      });
      
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      
      patient = invoice.patient;
      paymentUrl = invoice.stripeInvoiceUrl;
      
    } else if (validated.patientId && validated.lineItems?.length) {
      // Create new invoice
      patient = await prisma.patient.findUnique({
        where: { id: validated.patientId },
      });
      
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      
      // Check if Stripe is configured
      const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
      
      if (stripeConfigured) {
        // Create real Stripe invoice
        const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
        
        const result = await StripeInvoiceService.createInvoice({
          patientId: validated.patientId,
          description: validated.description,
          lineItems: validated.lineItems,
          dueInDays: validated.dueInDays,
          autoSend: false, // We'll send via SMS instead
        });
        
        invoice = result.invoice;
        paymentUrl = result.stripeInvoice.hosted_invoice_url || null;
        
      } else {
        // Demo mode - create invoice without Stripe
        const total = validated.lineItems.reduce((sum, item) => sum + item.amount, 0);
        
        invoice = await prisma.invoice.create({
          data: {
            patientId: validated.patientId,
            clinicId: user.clinicId,
            amount: total,
            amountDue: total,
            status: 'OPEN',
            dueDate: new Date(Date.now() + validated.dueInDays * 24 * 60 * 60 * 1000),
            description: validated.description || 'Medical Services',
            lineItems: validated.lineItems,
          },
        });
        
        // Generate a payment page URL (can be customized)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app';
        paymentUrl = `${baseUrl}/pay/${invoice.id}`;
      }
      
    } else {
      return NextResponse.json(
        { error: 'Either invoiceId or (patientId + lineItems) required' },
        { status: 400 }
      );
    }
    
    // Validate patient contact info
    const canSendSMS = patient.phone && (validated.sendMethod === 'sms' || validated.sendMethod === 'both');
    const canSendEmail = patient.email && (validated.sendMethod === 'email' || validated.sendMethod === 'both');
    
    if (!canSendSMS && !canSendEmail) {
      return NextResponse.json(
        { error: `Patient has no ${validated.sendMethod === 'sms' ? 'phone number' : validated.sendMethod === 'email' ? 'email' : 'contact info'}` },
        { status: 400 }
      );
    }
    
    // Get clinic info for branding
    const clinic = user.clinicId 
      ? await prisma.clinic.findUnique({ where: { id: user.clinicId } })
      : null;
    const clinicName = clinic?.name || 'EON Medical';
    
    // Format amount for display
    const amountDisplay = '$' + (invoice.amount / 100).toFixed(2);
    
    // Prepare the link (use Stripe URL if available, otherwise our payment page)
    const link = paymentUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/pay/${invoice.id}`;
    
    // Delivery tracking
    const deliveryResults: { method: string; success: boolean; error?: string }[] = [];
    
    // Send SMS
    if (canSendSMS && patient.phone) {
      try {
        const message = validated.customMessage
          ? SMS_TEMPLATES.invoiceWithMessage(clinicName, amountDisplay, link, validated.customMessage)
          : SMS_TEMPLATES.invoice(clinicName, amountDisplay, link);
        
        await sendSMS({
          to: formatPhoneNumber(patient.phone),
          body: message,
        });
        
        deliveryResults.push({ method: 'sms', success: true });
        
        logger.info('Invoice link sent via SMS', {
          invoiceId: invoice.id,
          patientId: patient.id,
          phone: patient.phone.slice(-4),
        });
        
      } catch (smsError: any) {
        logger.error('Failed to send invoice SMS', smsError);
        deliveryResults.push({ method: 'sms', success: false, error: smsError.message });
      }
    }
    
    // Send Email
    if (canSendEmail && patient.email) {
      try {
        await sendEmail({
          to: patient.email,
          subject: `${clinicName} - Invoice for ${amountDisplay}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10B981;">${clinicName}</h2>
              <p>Hello ${patient.firstName},</p>
              ${validated.customMessage ? `<p>${validated.customMessage}</p>` : ''}
              <p>Your invoice for <strong>${amountDisplay}</strong> is ready for payment.</p>
              <p style="margin: 30px 0;">
                <a href="${link}" style="background-color: #10B981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Pay Now
                </a>
              </p>
              <p style="color: #666; font-size: 12px;">
                Invoice #${invoice.stripeInvoiceNumber || invoice.id}<br/>
                ${invoice.dueDate ? `Due: ${new Date(invoice.dueDate).toLocaleDateString()}` : ''}
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"/>
              <p style="color: #999; font-size: 11px;">
                This is an automated message from ${clinicName}. 
                If you have questions, please contact us.
              </p>
            </div>
          `,
          text: `${clinicName}\n\nYour invoice for ${amountDisplay} is ready.\n\nPay here: ${link}\n\nInvoice #${invoice.stripeInvoiceNumber || invoice.id}`,
        });
        
        deliveryResults.push({ method: 'email', success: true });
        
        logger.info('Invoice link sent via email', {
          invoiceId: invoice.id,
          patientId: patient.id,
          email: patient.email,
        });
        
      } catch (emailError: any) {
        logger.error('Failed to send invoice email', emailError);
        deliveryResults.push({ method: 'email', success: false, error: emailError.message });
      }
    }
    
    // Update invoice metadata
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        metadata: {
          ...(invoice.metadata || {}),
          linkSentAt: new Date().toISOString(),
          linkSentBy: user.email,
          linkSentVia: deliveryResults.filter(r => r.success).map(r => r.method).join(','),
        },
      },
    });
    
    // Check if any delivery succeeded
    const anySuccess = deliveryResults.some(r => r.success);
    
    return NextResponse.json({
      success: anySuccess,
      invoice: {
        id: invoice.id,
        stripeInvoiceId: invoice.stripeInvoiceId,
        amount: invoice.amount,
        status: invoice.status,
        dueDate: invoice.dueDate,
      },
      paymentUrl: link,
      delivery: deliveryResults,
      message: anySuccess 
        ? `Invoice link sent successfully via ${deliveryResults.filter(r => r.success).map(r => r.method).join(' and ')}`
        : 'Failed to deliver invoice link',
    }, { status: anySuccess ? 200 : 500 });
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    logger.error('Failed to send invoice link', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send invoice link' },
      { status: 500 }
    );
  }
}

export const POST = standardRateLimit(withProviderAuth(sendInvoiceLinkHandler));

// GET endpoint to check invoice status and resend options
async function getInvoiceLinkHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoiceId');
    
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
    }
    
    const invoice = await prisma.invoice.findUnique({
      where: { id: parseInt(invoiceId) },
      include: { patient: true },
    });
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Get payment URL
    const paymentUrl = invoice.stripeInvoiceUrl 
      || `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/pay/${invoice.id}`;
    
    return NextResponse.json({
      invoice: {
        id: invoice.id,
        stripeInvoiceId: invoice.stripeInvoiceId,
        stripeInvoiceNumber: invoice.stripeInvoiceNumber,
        amount: invoice.amount,
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        description: invoice.description,
      },
      patient: {
        id: invoice.patient.id,
        name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
        phone: invoice.patient.phone,
        email: invoice.patient.email,
        canSendSMS: !!invoice.patient.phone,
        canSendEmail: !!invoice.patient.email,
      },
      paymentUrl,
      linkMetadata: invoice.metadata,
    });
    
  } catch (error: any) {
    logger.error('Failed to get invoice link info', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get invoice info' },
      { status: 500 }
    );
  }
}

export const GET = standardRateLimit(withProviderAuth(getInvoiceLinkHandler));
