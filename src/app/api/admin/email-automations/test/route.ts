/**
 * Test Email Automation API
 *
 * Send test emails to verify automations are working
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { triggerAutomation, AutomationTrigger } from '@/lib/email/automations';
import { sendEmail, previewTemplate, EmailTemplate } from '@/lib/email';

/**
 * POST /api/admin/email-automations/test
 * Send a test email or preview a template
 */
const postHandler = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const body = await request.json();
      const { action, trigger, template, recipientEmail, data } = body;

      // Default to admin's email if not provided
      const testEmail = recipientEmail || user.email;

      if (!testEmail) {
        return NextResponse.json(
          { success: false, error: 'Recipient email required' },
          { status: 400 }
        );
      }

      // Preview template without sending
      if (action === 'preview') {
        const emailTemplate = template || EmailTemplate.WELCOME;
        const templateData = data || {
          firstName: 'Test',
          lastName: 'User',
          patientName: 'Test User',
          appointmentDate: 'January 25, 2026',
          appointmentTime: '2:00 PM',
          providerName: 'Dr. Smith',
          location: 'Main Clinic',
        };

        const preview = await previewTemplate(emailTemplate, templateData);

        return NextResponse.json({
          success: true,
          data: {
            template: emailTemplate,
            preview,
          },
        });
      }

      // Send test automation
      if (action === 'test_automation' && trigger) {
        const automationTrigger = trigger as AutomationTrigger;

        if (!Object.values(AutomationTrigger).includes(automationTrigger)) {
          return NextResponse.json(
            { success: false, error: 'Invalid trigger type' },
            { status: 400 }
          );
        }

        const testData = data || getTestDataForTrigger(automationTrigger);

        const result = await triggerAutomation({
          trigger: automationTrigger,
          recipientEmail: testEmail,
          data: testData,
        });

        logger.info('Test automation sent', {
          trigger: automationTrigger,
          recipientEmail: testEmail,
          result,
        });

        return NextResponse.json({
          success: result.success,
          data: {
            trigger: automationTrigger,
            recipientEmail: testEmail,
            messageId: result.messageId,
            error: result.error,
          },
        });
      }

      // Send simple test email
      if (action === 'test_simple') {
        const result = await sendEmail({
          to: testEmail,
          subject: body.subject || 'Test Email from EONPro',
          html:
            body.html ||
            `
            <h2>Test Email</h2>
            <p>This is a test email from EONPro email automation system.</p>
            <p>Sent at: ${new Date().toLocaleString()}</p>
            <p>If you received this, your email configuration is working correctly!</p>
          `,
        });

        return NextResponse.json({
          success: result.success,
          data: {
            recipientEmail: testEmail,
            messageId: result.messageId,
            error: result.error,
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Use: preview, test_automation, or test_simple',
        },
        { status: 400 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Test email failed', { error: errorMessage });
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export { postHandler as POST };

/**
 * Get sample test data for each trigger type
 */
function getTestDataForTrigger(trigger: AutomationTrigger): Record<string, unknown> {
  const baseData = {
    firstName: 'Test',
    lastName: 'User',
    patientName: 'Test User',
    customerName: 'Test User',
  };

  switch (trigger) {
    case AutomationTrigger.PATIENT_WELCOME:
    case AutomationTrigger.PATIENT_CREATED:
      return baseData;

    case AutomationTrigger.APPOINTMENT_BOOKED:
    case AutomationTrigger.APPOINTMENT_REMINDER_24H:
    case AutomationTrigger.APPOINTMENT_REMINDER_2H:
      return {
        ...baseData,
        appointmentDate: 'January 25, 2026',
        appointmentTime: '2:00 PM',
        providerName: 'Dr. Smith',
        location: 'Main Clinic',
      };

    case AutomationTrigger.APPOINTMENT_CANCELLED:
    case AutomationTrigger.APPOINTMENT_RESCHEDULED:
      return {
        ...baseData,
        appointmentDate: 'January 25, 2026',
        appointmentTime: '2:00 PM',
        providerName: 'Dr. Smith',
        newDate: 'January 26, 2026',
        newTime: '3:00 PM',
      };

    case AutomationTrigger.ORDER_CREATED:
    case AutomationTrigger.ORDER_CONFIRMED:
      return {
        ...baseData,
        orderId: 'ORD-12345',
        items: [{ name: 'Test Product', quantity: 1, price: 99.99 }],
        totalAmount: 99.99,
        shippingAddress: '123 Test St, Test City, TS 12345',
      };

    case AutomationTrigger.ORDER_SHIPPED:
      return {
        ...baseData,
        orderId: 'ORD-12345',
        trackingNumber: '1Z999AA10123456784',
        estimatedDelivery: 'January 28, 2026',
      };

    case AutomationTrigger.PAYMENT_RECEIVED:
      return {
        ...baseData,
        amount: 99.99,
        invoiceNumber: 'INV-12345',
      };

    case AutomationTrigger.PAYMENT_FAILED:
      return {
        ...baseData,
        amount: 99.99,
        reason: 'Card declined',
        retryLink: 'https://example.com/retry',
      };

    case AutomationTrigger.PASSWORD_RESET:
      return {
        ...baseData,
        resetLink: 'https://example.com/reset?token=test123',
      };

    case AutomationTrigger.PRESCRIPTION_READY:
      return {
        ...baseData,
        medicationName: 'Test Medication',
        pharmacyName: 'Test Pharmacy',
        pickupInstructions: 'Ready for pickup during business hours',
      };

    default:
      return baseData;
  }
}
