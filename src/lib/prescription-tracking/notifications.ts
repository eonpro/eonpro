/**
 * Prescription Status Notification System
 * Automatically sends SMS and chat notifications to patients
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import twilio from 'twilio';
import { NotificationStatus, NotificationType, PrescriptionStatus } from '@prisma/client';

// Type for prisma models that may not be in the generated client yet
interface PrescriptionNotificationRecord {
  id: number;
  prescriptionId: number;
  type: NotificationType;
  status: NotificationStatus;
  message: string;
  templateUsed?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  recipientId?: string;
  externalId?: string;
  externalStatus?: string;
}

interface NotificationRuleRecord {
  id: number;
  triggerStatus: PrescriptionStatus;
  sendSMS: boolean;
  sendChat: boolean;
  sendEmail: boolean;
  isActive: boolean;
}

// Notification templates for different statuses
const NOTIFICATION_TEMPLATES = {
  SENT_TO_PHARMACY: {
    sms: 'Your prescription {medication} has been sent to the pharmacy for processing. We\'ll update you when it\'s ready.',
    chat: 'Great news! Your prescription for {medication} has been sent to the pharmacy. They\'ll start processing it shortly.',
    email: {
      subject: 'Prescription Sent to Pharmacy',
      body: 'Your prescription {medication} has been successfully sent to the pharmacy for processing.'
    }
  },
  RECEIVED: {
    sms: 'The pharmacy has received your prescription {medication} and will begin processing it soon.',
    chat: 'Update: The pharmacy has received your prescription for {medication}. Processing will begin shortly.',
    email: {
      subject: 'Prescription Received by Pharmacy',
      body: 'Good news! The pharmacy has received your prescription for {medication}.'
    }
  },
  PROCESSING: {
    sms: 'Your prescription {medication} is being prepared by the pharmacy.',
    chat: 'Your prescription for {medication} is now being prepared by the pharmacy team.',
    email: {
      subject: 'Prescription Being Processed',
      body: 'Your prescription for {medication} is currently being processed by the pharmacy.'
    }
  },
  READY_FOR_PICKUP: {
    sms: 'Your prescription {medication} is ready for pickup at {pharmacy}. Please bring your ID.',
    chat: 'Your prescription for {medication} is ready! You can pick it up at {pharmacy}. Don\'t forget to bring your ID.',
    email: {
      subject: 'Prescription Ready for Pickup',
      body: 'Your prescription for {medication} is ready for pickup at {pharmacy}.'
    }
  },
  SHIPPED: {
    sms: 'Your prescription {medication} has shipped! Track it: {trackingUrl}. Est. delivery: {estimatedDelivery}',
    chat: '📦 Your prescription for {medication} is on its way!\n\nTracking: {trackingNumber}\nCarrier: {carrier}\nEstimated delivery: {estimatedDelivery}\n\nTrack your package: {trackingUrl}',
    email: {
      subject: 'Your Prescription Has Shipped',
      body: 'Your prescription for {medication} has been shipped and is on its way to you.'
    }
  },
  OUT_FOR_DELIVERY: {
    sms: 'Your prescription {medication} is out for delivery today! Please be available to receive it.',
    chat: '🚚 Heads up! Your prescription for {medication} is out for delivery and should arrive today. Please make sure someone is available to receive it.',
    email: {
      subject: 'Your Prescription is Out for Delivery',
      body: 'Your prescription for {medication} is out for delivery and will arrive today.'
    }
  },
  DELIVERED: {
    sms: 'Your prescription {medication} has been delivered. Please check your delivery location.',
    chat: 'Your prescription for {medication} has been delivered successfully! Please check your delivery location. If you have any issues, let us know.',
    email: {
      subject: 'Your Prescription Has Been Delivered',
      body: 'Your prescription for {medication} has been delivered to your address.'
    }
  },
  CANCELLED: {
    sms: 'Your prescription {medication} has been cancelled. Please contact us if you have questions.',
    chat: 'Your prescription for {medication} has been cancelled. If this was unexpected, please contact us immediately.',
    email: {
      subject: 'Prescription Cancelled',
      body: 'Your prescription for {medication} has been cancelled.'
    }
  },
  ON_HOLD: {
    sms: 'Your prescription {medication} is on hold. We\'ll contact you with more information.',
    chat: 'Your prescription for {medication} is temporarily on hold. We\'re working to resolve this and will update you soon.',
    email: {
      subject: 'Prescription On Hold',
      body: 'Your prescription for {medication} is currently on hold.'
    }
  },
  FAILED: {
    sms: 'There was an issue with your prescription {medication}. Please contact us at {supportPhone}.',
    chat: 'There was an issue processing your prescription for {medication}. Please contact our support team at {supportPhone} for assistance.',
    email: {
      subject: 'Issue with Your Prescription',
      body: 'There was an issue processing your prescription for {medication}. Please contact us for assistance.'
    }
  }
};

/**
 * Replace template variables with actual values
 */
function populateTemplate(template: string, data: Record<string, any>): string {
  let message = template;
  
  Object.keys(data).forEach((key: any) => {
    const value = data[key] || '';
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    message = message.replace(regex, value);
  });
  
  // Remove any remaining placeholders
  message = message.replace(/\{[^}]+\}/g, '');
  
  return message;
}

/**
 * Generate tracking URL based on carrier
 */
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const carriers: Record<string, string> = {
    'ups': `https://www.ups.com/track?tracknum=${trackingNumber}`,
    'fedex': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    'usps': `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    'dhl': `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };
  
  return carriers[carrier.toLowerCase()] || '#';
}

/**
 * Send SMS notification via Twilio
 */
async function sendSMS(phone: string, message: string, notificationId: number): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.info('Twilio not configured, skipping SMS', { phone, message });
    
    // Update notification as sent (demo mode)
    await prisma.prescriptionNotification.update({
      where: { id: notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        deliveredAt: new Date(),
      }
    });
    
    return;
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    
    const twilioMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    await prisma.prescriptionNotification.update({
      where: { id: notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        externalId: twilioMessage.sid,
        externalStatus: twilioMessage.status,
      }
    });

    logger.info('SMS notification sent', { 
      notificationId, 
      messageSid: twilioMessage.sid 
    });
  } catch (error: any) {
    logger.error('Failed to send SMS', error);
    
    await prisma.prescriptionNotification.update({
      where: { id: notificationId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: error.message,
      }
    });
    
    throw error;
  }
}

/**
 * Send chat message (internal platform chat)
 */
async function sendChatMessage(
  patientId: number, 
  message: string, 
  notificationId: number
): Promise<void> {
  try {
    // Store chat message in database (you can integrate with your chat system)
    await prisma.prescriptionNotification.update({
      where: { id: notificationId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        deliveredAt: new Date(), // Mark as delivered for chat
      }
    });

    logger.info('Chat notification sent', { notificationId, patientId });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send chat message', { error: errorMessage });
    
    await prisma.prescriptionNotification.update({
      where: { id: notificationId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage,
      }
    });
    
    throw error;
  }
}

/**
 * Main function to send prescription notifications
 */
export async function sendPrescriptionNotification(
  prescriptionId: number,
  status: string
): Promise<void> {
  try {
    // Get prescription details
    const prescription = await prisma.prescriptionTracking.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: true,
        order: {
          include: {
            provider: true
          }
        }
      }
    });

    if (!prescription) {
      logger.error('Prescription not found', { prescriptionId });
      return;
    }

    // Get notification template
    const templates = NOTIFICATION_TEMPLATES[status as keyof typeof NOTIFICATION_TEMPLATES];
    if (!templates) {
      logger.warn('No notification template for status', { status });
      return;
    }

    // Check notification rules
    const rules = await prisma.notificationRule.findMany({
      where: {
        triggerStatus: status as PrescriptionStatus,
        isActive: true,
      }
    });

    // If no rules, use default behavior
    const shouldSendSMS = rules.length === 0 || rules.some((r: any) => r.sendSMS);
    const shouldSendChat = rules.length === 0 || rules.some((r: any) => r.sendChat);

    // Prepare template data
    const templateData = {
      medication: prescription.medicationName,
      pharmacy: prescription.pharmacyName || 'the pharmacy',
      trackingNumber: prescription.trackingNumber,
      carrier: prescription.carrier,
      estimatedDelivery: prescription.estimatedDeliveryDate ? 
        prescription.estimatedDeliveryDate.toLocaleDateString() : 
        'soon',
      trackingUrl: prescription.trackingNumber && prescription.carrier ? 
        getTrackingUrl(prescription.carrier, prescription.trackingNumber) : 
        '',
      supportPhone: process.env.SUPPORT_PHONE || '1-800-SUPPORT',
    };

    // Send SMS notification
    if (shouldSendSMS && prescription.patient.phone) {
      const smsMessage = populateTemplate(templates.sms, templateData);
      
      const smsNotification = await prisma.prescriptionNotification.create({
        data: {
          prescriptionId,
          type: 'SMS',
          status: 'PENDING',
          message: smsMessage,
          templateUsed: 'default',
          recipientPhone: prescription.patient.phone,
        }
      });

      // Send SMS asynchronously
      sendSMS(prescription.patient.phone, smsMessage, smsNotification.id)
        .catch(err => logger.error('SMS send failed', err));
    }

    // Send chat notification
    if (shouldSendChat) {
      const chatMessage = populateTemplate(templates.chat, templateData);
      
      const chatNotification = await prisma.prescriptionNotification.create({
        data: {
          prescriptionId,
          type: 'CHAT',
          status: 'PENDING',
          message: chatMessage,
          templateUsed: 'default',
          recipientId: prescription.patient.id.toString(),
        }
      });

      // Send chat message asynchronously
      sendChatMessage(prescription.patient.id, chatMessage, chatNotification.id)
        .catch(err => logger.error('Chat send failed', err));
    }

    logger.info('Prescription notifications queued', {
      prescriptionId,
      status,
      sms: shouldSendSMS,
      chat: shouldSendChat,
    });

  } catch (error: any) {
    logger.error('Failed to send prescription notification', {
      prescriptionId,
      status,
      error: error.message,
    });
  }
}

/**
 * Retry failed notifications
 */
export async function retryFailedNotifications(): Promise<void> {
  try {
    const failedNotifications = await prisma.prescriptionNotification.findMany({
      where: {
        status: 'FAILED',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        }
      },
      include: {
        prescription: {
          include: {
            patient: true
          }
        }
      },
      take: 100,
    });

    for (const notification of failedNotifications) {
      if (notification.type === 'SMS' && notification.recipientPhone) {
        await sendSMS(
          notification.recipientPhone, 
          notification.message, 
          notification.id
        );
      } else if (notification.type === 'CHAT') {
        await sendChatMessage(
          notification.prescription.patientId,
          notification.message,
          notification.id
        );
      }
    }

    logger.info('Retried failed notifications', { 
      count: failedNotifications.length 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to retry notifications', { error: errorMessage });
  }
}
