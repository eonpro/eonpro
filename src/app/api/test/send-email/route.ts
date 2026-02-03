/**
 * Test Email API Endpoint
 * 
 * For testing email service. Only available in development.
 * 
 * POST /api/test/send-email
 * Body: { "to": "email@example.com" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, getEmailServiceStatus } from '@/lib/email';

export async function POST(req: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const recipient = body.to || 'italo@eonmeds.com';

    const status = getEmailServiceStatus();

    const result = await sendEmail({
      to: recipient,
      subject: 'Test Email from Lifefile Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">Test Email</h1>
          <p>This is a test email from the Lifefile Platform email service.</p>
          <p>If you're seeing this, the email service is working correctly!</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
          <p style="color: #6B7280; font-size: 14px;">
            Sent at: ${new Date().toISOString()}<br>
            Mode: ${status.mode}
          </p>
        </div>
      `,
      text: `Test Email from Lifefile Platform\n\nThis is a test email. If you're seeing this, the email service is working correctly!\n\nSent at: ${new Date().toISOString()}`,
      sourceType: 'manual',
      sourceId: `test-${Date.now()}`,
    });

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      serviceStatus: status,
      recipient,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  const status = getEmailServiceStatus();
  return NextResponse.json({
    service: 'email',
    ...status,
    endpoint: 'POST /api/test/send-email with { "to": "email@example.com" }',
  });
}
