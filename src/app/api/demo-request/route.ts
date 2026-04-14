import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/integrations/aws/sesService';
import { logger } from '@/lib/logger';

const demoRequestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  practiceName: z.string().min(1).max(200),
  prescriptionsPerMonth: z.string().min(1),
  currentEmr: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = demoRequestSchema.parse(body);

    logger.info('[Demo Request] New submission', {
      practiceName: data.practiceName,
      prescriptionsPerMonth: data.prescriptionsPerMonth,
      currentEmr: data.currentEmr,
    });

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4fa77e; color: white; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 22px; }
            .content { padding: 24px 20px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 16px; }
            .field-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
            .field-value { font-size: 15px; color: #1f2933; margin-top: 2px; }
            .divider { border-top: 1px solid #e5e7eb; margin: 16px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Demo Request</h1>
            </div>
            <div class="content">
              <div class="field">
                <div class="field-label">Name</div>
                <div class="field-value">${data.firstName} ${data.lastName}</div>
              </div>
              <div class="field">
                <div class="field-label">Email</div>
                <div class="field-value">${data.email}</div>
              </div>
              <div class="field">
                <div class="field-label">Phone</div>
                <div class="field-value">${data.phone}</div>
              </div>
              <div class="divider"></div>
              <div class="field">
                <div class="field-label">Practice / Clinic</div>
                <div class="field-value">${data.practiceName}</div>
              </div>
              <div class="field">
                <div class="field-label">Prescriptions per Month</div>
                <div class="field-value">${data.prescriptionsPerMonth}</div>
              </div>
              <div class="field">
                <div class="field-label">Current EMR</div>
                <div class="field-value">${data.currentEmr}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: 'contact@eonpro.io',
      subject: `Demo Request: ${data.practiceName} — ${data.firstName} ${data.lastName}`,
      html: htmlBody,
      text: [
        'New Demo Request',
        '',
        `Name: ${data.firstName} ${data.lastName}`,
        `Email: ${data.email}`,
        `Phone: ${data.phone}`,
        `Practice: ${data.practiceName}`,
        `Prescriptions/Month: ${data.prescriptionsPerMonth}`,
        `Current EMR: ${data.currentEmr}`,
      ].join('\n'),
      replyTo: data.email,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid form data. Please check all fields and try again.' },
        { status: 400 }
      );
    }

    logger.error('[Demo Request] Failed to process', { error: err });
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
