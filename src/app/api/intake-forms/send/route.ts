import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';

import { prisma } from '@/lib/db';
import { withProviderAuth } from '@/lib/auth/middleware';
import { sendEmail } from '@/lib/email';
// TODO: Implement SMS functionality when needed
// import { sendSMS } from '@/lib/integrations/twilio/smsService';

/**
 * POST /api/intake-forms/send
 * Generate and send an intake form link to a patient
 */
export const POST = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const {
      templateId,
      patientId,
      sendVia, // "email", "sms", or "both"
      customMessage,
    } = body;

    if (!templateId || !patientId || !sendVia) {
      return NextResponse.json(
        { error: 'Template ID, patient ID, and send method are required' },
        { status: 400 }
      );
    }

    // Get template and patient
    const [template, patient] = await Promise.all([
      prisma.intakeFormTemplate.findUnique({
        where: { id: templateId },
        include: { questions: true },
      }),
      prisma.patient.findUnique({
        where: { id: patientId },
      }),
    ]);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Check if form can be sent
    if ((sendVia === 'email' || sendVia === 'both') && !patient.email) {
      return NextResponse.json({ error: 'Patient has no email address' }, { status: 400 });
    }

    if ((sendVia === 'sms' || sendVia === 'both') && !patient.phone) {
      return NextResponse.json({ error: 'Patient has no phone number' }, { status: 400 });
    }

    // Generate form link
    const formLink = await prisma.intakeFormLink.create({
      data: {
        templateId,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        sentVia: sendVia,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        isActive: true,
        metadata: {
          patientId,
          patientName: `${patient.firstName} as any ${patient.lastName}`,
          sentBy: user.email,
          sentByRole: user.role,
        },
      },
    });

    // Create initial submission record
    const submission = await prisma.intakeFormSubmission.create({
      data: {
        templateId,
        patientId,
        formLinkId: formLink.id,
        status: 'PENDING',
      },
    });

    // Build the form URL
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`;
    const formUrl = `${baseUrl}/intake/link/${formLink.id}`;

    // Default message
    const defaultMessage =
      customMessage ||
      `Hello ${patient.firstName}, please complete your ${template.name} form by clicking the link below. This link will expire in 7 days.`;

    let emailSent = false;
    let smsSent = false;
    const errors: string[] = [];

    // Send email
    if (sendVia === 'email' || sendVia === 'both') {
      try {
        await sendEmail({
          to: patient.email,
          subject: `Please Complete Your ${template.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Intake Form Request</h2>
              <p>${defaultMessage}</p>
              <div style="margin: 30px 0;">
                <a href="${formUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Complete Form
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">
                Or copy this link: ${formUrl}
              </p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">
                This link will expire in 7 days. If you need assistance, please contact our office.
              </p>
            </div>
          `,
        });
        emailSent = true;
      } catch (error: any) {
        // @ts-ignore

        logger.error('Error sending email:', error);
        errors.push('Failed to send email');
      }
    }

    // Send SMS (TODO: Implement when SMS service is configured)
    if (sendVia === 'sms' || sendVia === 'both') {
      // SMS functionality is temporarily disabled
      // Uncomment when Twilio is configured:
      /*
      try {
        const smsMessage = `${defaultMessage}\n\nComplete your form here: ${formUrl}`;
        await sendSMS({
          to: patient.phone,
          message: smsMessage
        });
        smsSent = true;
      } catch (error: any) {
    // @ts-ignore
   
        logger.error('Error sending SMS:', error);
        errors.push('Failed to send SMS');
      }
      */
      errors.push('SMS functionality is not yet configured');
    }

    // Update form link with sent timestamp
    if (emailSent || smsSent) {
      await prisma.intakeFormLink.update({
        where: { id: formLink.id },
        data: { sentAt: new Date() },
      });
    }

    return NextResponse.json({
      message: 'Form link generated successfully',
      formLink: {
        id: formLink.id,
        url: formUrl,
        expiresAt: formLink.expiresAt,
      },
      submission: {
        id: submission.id,
        status: submission.status,
      },
      delivery: {
        emailSent,
        smsSent,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Error sending intake form:', error);
    return NextResponse.json({ error: 'Failed to send intake form' }, { status: 500 });
  }
});
