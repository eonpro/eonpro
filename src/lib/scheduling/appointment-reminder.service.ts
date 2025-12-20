/**
 * Appointment Reminder Service
 * 
 * Handles automated appointment reminders via SMS and Email
 * Integrates with Twilio for SMS and can integrate with SendGrid/SES for email
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTwilioClient, isTwilioConfigured, SMS_TEMPLATES } from '@/lib/integrations/twilio/config';
import { ReminderStatus, ReminderType } from '@prisma/client';

// Reminder timing configuration (hours before appointment)
export const REMINDER_SCHEDULE = {
  FIRST_REMINDER: 24, // 24 hours before
  SECOND_REMINDER: 2,  // 2 hours before
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
    const firstReminderTime = new Date(appointmentTime.getTime() - REMINDER_SCHEDULE.FIRST_REMINDER * 60 * 60 * 1000);
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
      logger.info('Created 24-hour appointment reminder', { appointmentId, scheduledFor: firstReminderTime });
    }

    // Create 2-hour reminder if applicable
    const secondReminderTime = new Date(appointmentTime.getTime() - REMINDER_SCHEDULE.SECOND_REMINDER * 60 * 60 * 1000);
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
      logger.info('Created 2-hour appointment reminder', { appointmentId, scheduledFor: secondReminderTime });
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
async function sendSMSReminder(appointment: AppointmentForReminder, template: string): Promise<SendReminderResult> {
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
      // Build a more urgent 2-hour reminder
      let locationInfo = '';
      if (appointment.type === 'VIDEO' && appointment.videoLink) {
        locationInfo = `\n\nJoin video call: ${appointment.videoLink}`;
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
    logger.error('Failed to send SMS reminder', { appointmentId: appointment.id, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Send Email reminder (placeholder - integrate with your email provider)
 */
async function sendEmailReminder(appointment: AppointmentForReminder, template: string): Promise<SendReminderResult> {
  // TODO: Integrate with SendGrid, AWS SES, or other email provider
  try {
    const appointmentDate = new Date(appointment.startTime).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const doctorName = `Dr. ${appointment.provider.firstName} ${appointment.provider.lastName}`;
    
    // For now, log the email that would be sent
    logger.info('Email reminder would be sent', {
      to: appointment.patient.email,
      subject: `Appointment Reminder - ${appointmentDate}`,
      appointmentId: appointment.id,
      doctorName,
      template,
    });

    // If you have SendGrid or AWS SES configured, implement here:
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, from, subject, html });

    return { success: true, messageId: `email-${Date.now()}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email reminder', { appointmentId: appointment.id, error: errorMessage });
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

  // Send based on reminder type
  if (reminder.type === ReminderType.SMS || reminder.type === ReminderType.BOTH) {
    smsResult = await sendSMSReminder(reminder.appointment, template);
  }

  if (reminder.type === ReminderType.EMAIL || reminder.type === ReminderType.BOTH) {
    emailResult = await sendEmailReminder(reminder.appointment, template);
  }

  // Determine overall success
  const success = smsResult.success || emailResult.success;
  const messageId = smsResult.messageId || emailResult.messageId;
  const errorMessage = !success ? (smsResult.error || emailResult.error) : null;

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
 * Send immediate confirmation when appointment is confirmed
 */
export async function sendAppointmentConfirmation(appointmentId: number): Promise<SendReminderResult> {
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

    const appointmentDate = new Date(appointment.startTime).toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const patientName = appointment.patient.firstName;

    if (!isTwilioConfigured()) {
      logger.warn('Twilio not configured, skipping confirmation SMS');
      return { success: false, error: 'Twilio not configured' };
    }

    const client = getTwilioClient();
    const formattedPhone = appointment.patient.phone.startsWith('+')
      ? appointment.patient.phone
      : `+1${appointment.patient.phone.replace(/\D/g, '')}`;

    const message = await client.messages.create({
      body: SMS_TEMPLATES.APPOINTMENT_CONFIRMATION(patientName, appointmentDate),
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });

    logger.info('Appointment confirmation sent', {
      appointmentId,
      messageSid: message.sid,
    });

    return { success: true, messageId: message.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send appointment confirmation', { appointmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get reminder statistics for a clinic
 */
export async function getReminderStats(clinicId?: number, days: number = 30): Promise<{
  totalSent: number;
  totalFailed: number;
  pendingCount: number;
  byType: Record<string, number>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = clinicId
    ? { appointment: { clinicId } }
    : {};

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
    byType: byType.reduce((acc, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {} as Record<string, number>),
  };
}
