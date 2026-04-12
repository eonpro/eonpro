/**
 * Appointment Reminder Service
 *
 * Handles automated appointment reminders via SMS and Email
 * Integrates with Twilio for SMS and can integrate with SendGrid/SES for email
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  getTwilioClient,
  isTwilioConfigured,
  SMS_TEMPLATES,
} from '@/lib/integrations/twilio/config';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { ReminderStatus, ReminderType } from '@prisma/client';

// Reminder timing configuration (hours before appointment)
export const REMINDER_SCHEDULE = {
  FIRST_REMINDER: 24, // 24 hours before
  SECOND_REMINDER: 2, // 2 hours before
};

interface SendReminderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface AppointmentForReminder {
  id: number;
  startTime: Date;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  provider: {
    firstName: string;
    lastName: string;
  };
  type: string;
  location?: string | null;
  videoLink?: string | null;
  zoomJoinUrl?: string | null;
}

/**
 * Create appointment reminders when an appointment is scheduled
 */
export async function createAppointmentReminders(appointmentId: number): Promise<void> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        provider: true,
      },
    });

    if (!appointment) {
      logger.error('Appointment not found for reminder creation', { appointmentId });
      return;
    }

    const now = new Date();
    const appointmentTime = new Date(appointment.startTime);

    // Create 24-hour reminder if applicable
    const firstReminderTime = new Date(
      appointmentTime.getTime() - REMINDER_SCHEDULE.FIRST_REMINDER * 60 * 60 * 1000
    );
    if (firstReminderTime > now) {
      await prisma.appointmentReminder.create({
        data: {
          appointmentId,
          type: ReminderType.BOTH,
          scheduledFor: firstReminderTime,
          status: ReminderStatus.PENDING,
          template: 'APPOINTMENT_REMINDER_24H',
        },
      });
      logger.info('Created 24-hour appointment reminder', {
        appointmentId,
        scheduledFor: firstReminderTime,
      });
    }

    // Create 2-hour reminder if applicable
    const secondReminderTime = new Date(
      appointmentTime.getTime() - REMINDER_SCHEDULE.SECOND_REMINDER * 60 * 60 * 1000
    );
    if (secondReminderTime > now) {
      await prisma.appointmentReminder.create({
        data: {
          appointmentId,
          type: ReminderType.SMS, // Only SMS for 2-hour reminder
          scheduledFor: secondReminderTime,
          status: ReminderStatus.PENDING,
          template: 'APPOINTMENT_REMINDER_2H',
        },
      });
      logger.info('Created 2-hour appointment reminder', {
        appointmentId,
        scheduledFor: secondReminderTime,
      });
    }
  } catch (error) {
    logger.error('Failed to create appointment reminders', { appointmentId, error });
    throw error;
  }
}

/**
 * Cancel all pending reminders for an appointment
 */
export async function cancelAppointmentReminders(appointmentId: number): Promise<void> {
  try {
    await prisma.appointmentReminder.updateMany({
      where: {
        appointmentId,
        status: ReminderStatus.PENDING,
      },
      data: {
        status: ReminderStatus.CANCELLED,
      },
    });
    logger.info('Cancelled appointment reminders', { appointmentId });
  } catch (error) {
    logger.error('Failed to cancel appointment reminders', { appointmentId, error });
    throw error;
  }
}

/**
 * Send SMS reminder
 */
async function sendSMSReminder(
  appointment: AppointmentForReminder,
  template: string
): Promise<SendReminderResult> {
  if (!isTwilioConfigured()) {
    logger.warn('Twilio not configured, skipping SMS reminder');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = getTwilioClient();
    const appointmentDate = new Date(appointment.startTime).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const doctorName = `${appointment.provider.firstName} ${appointment.provider.lastName}`;
    const patientName = appointment.patient.firstName;

    let messageBody: string;

    if (template === 'APPOINTMENT_REMINDER_24H') {
      messageBody = SMS_TEMPLATES.APPOINTMENT_REMINDER(patientName, appointmentDate, doctorName);
    } else if (template === 'APPOINTMENT_REMINDER_2H') {
      let locationInfo = '';
      const joinLink = appointment.zoomJoinUrl || appointment.videoLink;
      if (appointment.type === 'VIDEO' && joinLink) {
        locationInfo = `\n\nJoin video call: ${joinLink}`;
      } else if (appointment.type === 'VIDEO') {
        const portalBase = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
        locationInfo = `\n\nJoin video call: ${portalBase}/portal/telehealth?appointmentId=${appointment.id}`;
      } else if (appointment.location) {
        locationInfo = `\n\nLocation: ${appointment.location}`;
      }

      messageBody = `Hi ${patientName}, your appointment with Dr. ${doctorName} is in 2 hours at ${appointmentDate}.${locationInfo}\n\nReply CONFIRM if you're on your way!`;
    } else {
      messageBody = SMS_TEMPLATES.APPOINTMENT_REMINDER(patientName, appointmentDate, doctorName);
    }

    // Format phone number
    const formattedPhone = appointment.patient.phone.startsWith('+')
      ? appointment.patient.phone
      : `+1${appointment.patient.phone.replace(/\D/g, '')}`;

    const message = await client.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    logger.info('SMS reminder sent', {
      appointmentId: appointment.id,
      patientId: appointment.patient.id,
      messageSid: message.sid,
    });

    return { success: true, messageId: message.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send SMS reminder', {
      appointmentId: appointment.id,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Send Email reminder via AWS SES
 */
async function sendEmailReminder(
  appointment: AppointmentForReminder,
  template: string
): Promise<SendReminderResult> {
  // Import email service dynamically to avoid circular dependencies
  const { sendTemplatedEmail, EmailTemplate } = await import('@/lib/email');

  try {
    const appointmentDate = new Date(appointment.startTime).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const appointmentTime = new Date(appointment.startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const providerName = `Dr. ${appointment.provider.firstName} ${appointment.provider.lastName}`;

    let location = 'TBD';
    const emailJoinLink = appointment.zoomJoinUrl || appointment.videoLink;
    if (appointment.type === 'VIDEO' && emailJoinLink) {
      location = `Video Call: ${emailJoinLink}`;
    } else if (appointment.type === 'VIDEO') {
      const portalBase = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
      location = `Video Call: ${portalBase}/portal/telehealth?appointmentId=${appointment.id}`;
    } else if (appointment.location) {
      location = appointment.location;
    }

    const result = await sendTemplatedEmail({
      to: appointment.patient.email,
      template: EmailTemplate.APPOINTMENT_REMINDER,
      data: {
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        appointmentDate,
        appointmentTime,
        providerName,
        location,
        notes:
          template === 'APPOINTMENT_REMINDER_2H' ? 'Your appointment is in 2 hours!' : undefined,
      },
    });

    if (result.success) {
      logger.info('Email reminder sent via SES', {
        appointmentId: appointment.id,
        patientId: appointment.patient.id,
        messageId: result.messageId,
      });
      return { success: true, messageId: result.messageId };
    } else {
      logger.error('Email reminder failed', {
        appointmentId: appointment.id,
        error: result.error,
      });
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email reminder', {
      appointmentId: appointment.id,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Process a single reminder
 */
async function processReminder(reminder: {
  id: number;
  type: ReminderType;
  template: string | null;
  appointment: AppointmentForReminder;
}): Promise<void> {
  const template = reminder.template || 'APPOINTMENT_REMINDER';
  let smsResult: SendReminderResult = { success: false };
  let emailResult: SendReminderResult = { success: false };

  const decryptedAppointment: AppointmentForReminder = {
    ...reminder.appointment,
    patient: {
      ...reminder.appointment.patient,
      firstName: decryptPHI(reminder.appointment.patient.firstName) ?? reminder.appointment.patient.firstName,
      lastName: decryptPHI(reminder.appointment.patient.lastName) ?? reminder.appointment.patient.lastName,
      phone: decryptPHI(reminder.appointment.patient.phone) ?? reminder.appointment.patient.phone,
      email: decryptPHI(reminder.appointment.patient.email) ?? reminder.appointment.patient.email,
    },
  };

  if (decryptedAppointment.patient.phone && (reminder.type === ReminderType.SMS || reminder.type === ReminderType.BOTH)) {
    smsResult = await sendSMSReminder(decryptedAppointment, template);
  }

  if (decryptedAppointment.patient.email && (reminder.type === ReminderType.EMAIL || reminder.type === ReminderType.BOTH)) {
    emailResult = await sendEmailReminder(decryptedAppointment, template);
  }

  // Determine overall success
  const success = smsResult.success || emailResult.success;
  const messageId = smsResult.messageId || emailResult.messageId;
  const errorMessage = !success ? smsResult.error || emailResult.error : null;

  // Update reminder status
  await prisma.appointmentReminder.update({
    where: { id: reminder.id },
    data: {
      status: success ? ReminderStatus.SENT : ReminderStatus.FAILED,
      sentAt: success ? new Date() : null,
      messageId,
      errorMessage,
    },
  });
}

/**
 * Process all pending reminders that are due
 * This should be called by a cron job every minute
 */
export async function processPendingReminders(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const now = new Date();
  const stats = { processed: 0, successful: 0, failed: 0 };

  try {
    // Find all pending reminders that are due
    const dueReminders = await prisma.appointmentReminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        scheduledFor: {
          lte: now,
        },
        appointment: {
          status: {
            in: ['SCHEDULED', 'CONFIRMED'],
          },
        },
      },
      include: {
        appointment: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
            provider: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    logger.info('Processing pending reminders', { count: dueReminders.length });

    for (const reminder of dueReminders) {
      try {
        await processReminder({
          id: reminder.id,
          type: reminder.type,
          template: reminder.template,
          appointment: {
            id: reminder.appointment.id,
            startTime: reminder.appointment.startTime,
            patient: reminder.appointment.patient,
            provider: reminder.appointment.provider,
            type: reminder.appointment.type,
            location: reminder.appointment.location,
            videoLink: reminder.appointment.videoLink,
            zoomJoinUrl: (reminder.appointment as any).zoomJoinUrl,
          },
        });
        stats.successful++;
      } catch (error) {
        stats.failed++;
        logger.error('Failed to process reminder', { reminderId: reminder.id, error });
      }
      stats.processed++;
    }

    logger.info('Completed processing reminders', stats);
    return stats;
  } catch (error) {
    logger.error('Failed to process pending reminders', { error });
    throw error;
  }
}

/**
 * Send immediate confirmation when appointment is created or confirmed.
 * Sends both SMS and email to the patient.
 */
export async function sendAppointmentConfirmation(
  appointmentId: number
): Promise<SendReminderResult> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        provider: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    const patientFirstName = decryptPHI(appointment.patient.firstName) ?? appointment.patient.firstName ?? 'Patient';
    const patientEmail = decryptPHI(appointment.patient.email) ?? appointment.patient.email;
    const patientPhone = decryptPHI(appointment.patient.phone) ?? appointment.patient.phone;
    const providerName = `${appointment.provider.firstName} ${appointment.provider.lastName}`;
    const providerDisplayName = `Dr. ${providerName}`;

    const appointmentDateFormatted = new Date(appointment.startTime).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const appointmentDateOnly = new Date(appointment.startTime).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const appointmentTimeOnly = new Date(appointment.startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    let smsResult: { success: boolean; messageId?: string } = { success: false };
    let emailResult: { success: boolean } = { success: false };

    let videoLink = appointment.type === 'VIDEO'
      ? appointment.zoomJoinUrl || appointment.videoLink || undefined
      : undefined;

    // For VIDEO appointments, re-fetch if the link wasn't available yet (Zoom may
    // have been provisioned after the initial appointment load)
    if (appointment.type === 'VIDEO' && !videoLink) {
      try {
        const refreshed = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { zoomJoinUrl: true, videoLink: true },
        });
        videoLink = refreshed?.zoomJoinUrl || refreshed?.videoLink || undefined;
      } catch { /* non-blocking */ }
    }

    // Fallback: patient portal lobby loads the Zoom link dynamically
    const portalBase = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
    if (appointment.type === 'VIDEO' && !videoLink) {
      videoLink = `${portalBase}/portal/telehealth?appointmentId=${appointmentId}`;
    }

    if (patientPhone && isTwilioConfigured()) {
      try {
        const client = getTwilioClient();
        const formattedPhone = patientPhone.startsWith('+')
          ? patientPhone
          : `+1${patientPhone.replace(/\D/g, '')}`;
        const videoAppointmentDateTime = `${appointmentDateOnly} at ${appointmentTimeOnly}`;
        const smsBody =
          appointment.type === 'VIDEO' && videoLink
            ? `Hi ${patientFirstName}, your telehealth appointment with ${providerDisplayName} is scheduled for ${videoAppointmentDateTime}.\n\nJoin link: ${videoLink}`
            : SMS_TEMPLATES.APPOINTMENT_CONFIRMATION(
                patientFirstName,
                appointmentDateFormatted,
                videoLink ?? undefined
              );

        const message = await client.messages.create({
          body: smsBody,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone,
        });

        smsResult = { success: true, messageId: message.sid };
        logger.info('Appointment confirmation SMS sent', { appointmentId, messageSid: message.sid });
      } catch (smsErr) {
        logger.error('Failed to send appointment confirmation SMS', {
          appointmentId,
          error: smsErr instanceof Error ? smsErr.message : 'Unknown',
        });
      }
    }

    if (patientEmail) {
      try {
        const { sendAppointmentConfirmationEmail } = await import('@/lib/email/automations');
        const location = appointment.type === 'VIDEO'
          ? `Video Call${videoLink ? `: ${videoLink}` : ''}`
          : appointment.location || 'TBD';

        emailResult = await sendAppointmentConfirmationEmail({
          patientEmail,
          patientName: patientFirstName,
          providerName,
          appointmentDate: appointmentDateOnly,
          appointmentTime: appointmentTimeOnly,
          location,
        });

        if (emailResult.success) {
          logger.info('Appointment confirmation email sent', { appointmentId });
        }
      } catch (emailErr) {
        logger.error('Failed to send appointment confirmation email', {
          appointmentId,
          error: emailErr instanceof Error ? emailErr.message : 'Unknown',
        });
      }
    }

    return {
      success: smsResult.success || emailResult.success,
      messageId: smsResult.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send appointment confirmation', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get reminder statistics for a clinic
 */
export async function getReminderStats(
  clinicId?: number,
  days: number = 30
): Promise<{
  totalSent: number;
  totalFailed: number;
  pendingCount: number;
  byType: Record<string, number>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = clinicId ? { appointment: { clinicId } } : {};

  const [sent, failed, pending, byType] = await Promise.all([
    prisma.appointmentReminder.count({
      where: { ...where, status: ReminderStatus.SENT, sentAt: { gte: since } },
    }),
    prisma.appointmentReminder.count({
      where: { ...where, status: ReminderStatus.FAILED, createdAt: { gte: since } },
    }),
    prisma.appointmentReminder.count({
      where: { ...where, status: ReminderStatus.PENDING },
    }),
    prisma.appointmentReminder.groupBy({
      by: ['type'],
      where: { ...where, status: ReminderStatus.SENT, sentAt: { gte: since } },
      _count: true,
    }),
  ]);

  return {
    totalSent: sent,
    totalFailed: failed,
    pendingCount: pending,
    byType: byType.reduce(
      (acc: Record<string, number>, item: { type: string; _count: number }) => {
        acc[item.type] = item._count;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}
