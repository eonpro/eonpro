import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';

interface NotificationOptions {
  submissionId: number;
  notifyProvider?: boolean;
  notifyAdmin?: boolean;
  notifyPatient?: boolean;
}

export async function sendIntakeFormNotifications(options: NotificationOptions): Promise<void> {
  const { submissionId, notifyProvider = true, notifyAdmin = true, notifyPatient = true } = options;

  try {
    // Fetch submission details
    const submission = await prisma.intakeFormSubmission.findUnique({
      where: { id: submissionId },
      include: {
        patient: true,
        template: {
          include: {
            provider: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    const notifications: Promise<unknown>[] = [];

    // Notify provider if they exist and have an email
    if (notifyProvider && submission.template.provider?.email) {
      const providerEmail = {
        to: submission.template.provider.email,
        subject: `New Intake Form Submission: ${submission.template.name}`,
        html: `
          <h2>New Intake Form Submission</h2>
          <p>A patient has completed an intake form.</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Form:</strong> ${submission.template.name}</p>
            <p><strong>Patient:</strong> ${submission.patient.firstName} ${submission.patient.lastName}</p>
            <p><strong>Email:</strong> ${submission.patient.email}</p>
            <p><strong>Submitted:</strong> ${new Date(submission.completedAt || submission.createdAt).toLocaleString()}</p>
          </div>
          <p>You can view the submission in the patient's intake tab.</p>
          <p style="margin-top: 30px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/patients/${submission.patient.id}?tab=intake" 
               style="background: #4fa77e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              View Patient Intake
            </a>
          </p>
        `
      };

      notifications.push(
        sendEmail(providerEmail).catch((err) => {
          logger.error('Failed to send provider notification', { err, submissionId });
        })
      );
    }

    // Notify admin users
    if (notifyAdmin) {
      const adminUsers = await prisma.user.findMany({
        where: {
          role: { in: ["SUPER_ADMIN", "ADMIN"] },
          status: 'ACTIVE'
        }
      });

      for (const admin of adminUsers) {
        if (admin.email) {
          const adminEmail = {
            to: admin.email,
            subject: `[Admin] New Intake Form: ${submission.template.name}`,
            html: `
              <h2>New Intake Form Submission</h2>
              <p>A new intake form has been submitted.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Form:</strong> ${submission.template.name}</p>
                <p><strong>Treatment Type:</strong> ${submission.template.treatmentType}</p>
                <p><strong>Patient:</strong> ${submission.patient.firstName} ${submission.patient.lastName}</p>
                <p><strong>Email:</strong> ${submission.patient.email}</p>
                <p><strong>Phone:</strong> ${submission.patient.phone || 'Not provided'}</p>
                <p><strong>Submitted:</strong> ${new Date(submission.completedAt || submission.createdAt).toLocaleString()}</p>
              </div>
              <p style="margin-top: 30px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/patients/${submission.patient.id}?tab=intake" 
                   style="background: #4fa77e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                  View Submission
                </a>
              </p>
            `
          };
          
          notifications.push(
            sendEmail(adminEmail).catch(err => {
              logger.error('Failed to send admin notification', { err, submissionId, adminId: admin.id });
            })
          );
        }
      }
    }

    // Send confirmation to patient
    if (notifyPatient && submission.patient.email) {
      const patientEmail = {
        to: submission.patient.email,
        subject: `Thank You - Your ${submission.template.name} Has Been Received`,
        html: `
          <h2>Thank You for Submitting Your Form</h2>
          <p>Dear ${submission.patient.firstName},</p>
          <p>We have successfully received your ${submission.template.name}. Our team will review your information and contact you soon.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>Submission Details:</h3>
            <p><strong>Form:</strong> ${submission.template.name}</p>
            <p><strong>Submitted on:</strong> ${new Date(submission.completedAt || submission.createdAt).toLocaleString()}</p>
            <p><strong>Reference ID:</strong> ${submission.id}</p>
          </div>
          
          <p>If you have any questions or need to update your information, please contact us.</p>
          
          <p>Best regards,<br>
          ${process.env.NEXT_PUBLIC_CLINIC_NAME || 'EONPro'} Team</p>
          
          <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #666;">
            This is an automated message. Please do not reply directly to this email.
            If you need assistance, please contact our support team.
          </p>
        `
      };
      
      notifications.push(
        sendEmail(patientEmail).catch(err => {
          logger.error('Failed to send patient confirmation', { err, submissionId });
        })
      );
    }

    // Wait for all notifications to complete
    await Promise.all(notifications);
    
    logger.info('Intake form notifications sent', { 
      submissionId, 
      notificationsSent: notifications.length 
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to send intake form notifications', { error, submissionId });
    throw error;
  }
}

// Helper function to get notification recipients based on template settings
export async function getNotificationRecipients(templateId: number): Promise<{
  providers: string[];
  admins: string[];
}> {
  const template = await prisma.intakeFormTemplate.findUnique({
    where: { id: templateId },
    include: {
      provider: true
    }
  });

  const providers: string[] = [];
  const admins: string[] = [];

  // Add provider email if exists
  if (template?.provider?.email) {
    providers.push(template.provider.email);
  }

  // Get all admin emails
  const adminUsers = await prisma.user.findMany({
    where: {
      role: { in: ["SUPER_ADMIN", "ADMIN"] },
      status: 'ACTIVE'
    },
    select: { email: true }
  });

  adminUsers.forEach((admin: any) => {
    if (admin.email) {
      admins.push(admin.email);
    }
  });

  return { providers, admins };
}

// Function to send a test notification for a template
export async function sendTestNotification(templateId: number, recipientEmail: string): Promise<void> {
  try {
    const template = await prisma.intakeFormTemplate.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const testEmail = {
      to: recipientEmail,
      subject: `[TEST] Intake Form Notification: ${template.name}`,
      html: `
        <h2>Test Notification</h2>
        <p>This is a test notification for the intake form template:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Form Name:</strong> ${template.name}</p>
          <p><strong>Description:</strong> ${template.description || 'N/A'}</p>
          <p><strong>Treatment Type:</strong> ${template.treatmentType}</p>
        </div>
        <p>When a patient completes this form, you will receive a notification similar to this one with their submission details.</p>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This is a test message sent from ${process.env.NEXT_PUBLIC_CLINIC_NAME || 'EONPro'}.
        </p>
      `
    };

    await sendEmail(testEmail);
    logger.info('Test notification sent', { templateId, recipientEmail });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to send test notification', { error, templateId, recipientEmail });
    throw error;
  }
}
