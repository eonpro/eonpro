/**
 * Push Notifications Service
 * Handles web push notifications for patient portal
 */

import { logger } from '@/lib/logger';

// VAPID public key (must match server-side key)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) {
    logger.warn('Push notifications not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
      },
    };

    return subscriptionData;
  } catch (error) {
    logger.error('Failed to subscribe to push:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to unsubscribe from push:', error);
    return false;
  }
}

/**
 * Register push subscription with server
 */
export async function registerPushSubscription(
  subscription: PushSubscriptionData,
  patientId: number
): Promise<boolean> {
  try {
    const response = await fetch('/api/patient-portal/push-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription,
        patientId,
      }),
    });

    return response.ok;
  } catch (error) {
    logger.error('Failed to register push subscription:', error);
    return false;
  }
}

/**
 * Unregister push subscription from server
 */
export async function unregisterPushSubscription(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch('/api/patient-portal/push-subscription', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint }),
    });

    return response.ok;
  } catch (error) {
    logger.error('Failed to unregister push subscription:', error);
    return false;
  }
}

/**
 * Show a local notification (for immediate display without server push)
 */
export async function showLocalNotification(payload: NotificationPayload): Promise<void> {
  if (!isPushSupported()) {
    return;
  }

  if (Notification.permission !== 'granted') {
    logger.warn('Notification permission not granted');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const options: NotificationOptions & { vibrate?: number[] } = {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/badge-72x72.png',
      tag: payload.tag,
      data: payload.data,
      actions: payload.actions,
      requireInteraction: payload.requireInteraction,
    };
    // vibrate is valid but not always in TS types
    (options as Record<string, unknown>).vibrate = [100, 50, 100];

    await registration.showNotification(payload.title, options);
  } catch (error) {
    logger.error('Failed to show notification:', error);
  }
}

// Notification type constants
export const NotificationTypes = {
  MEDICATION_REMINDER: 'medication-reminder',
  SHIPMENT_UPDATE: 'shipment-update',
  APPOINTMENT_REMINDER: 'appointment-reminder',
  MESSAGE_RECEIVED: 'message-received',
  PROGRESS_SUMMARY: 'progress-summary',
  ACHIEVEMENT_UNLOCKED: 'achievement-unlocked',
  GOAL_REACHED: 'goal-reached',
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];

/**
 * Create notification payload for specific notification types
 */
export function createNotificationPayload(
  type: NotificationType,
  data: Record<string, unknown>
): NotificationPayload {
  switch (type) {
    case NotificationTypes.MEDICATION_REMINDER:
      return {
        title: 'Medication Reminder',
        body: `Time to take your ${data.medicationName || 'medication'}`,
        icon: '/icons/notification-medication.png',
        tag: `medication-${data.medicationId}`,
        data: { url: '/patient-portal/medications', type },
        actions: [
          { action: 'taken', title: 'Mark as Taken' },
          { action: 'snooze', title: 'Snooze 30 min' },
        ],
        requireInteraction: true,
      };

    case NotificationTypes.SHIPMENT_UPDATE:
      return {
        title: 'Shipment Update',
        body: data.message as string || 'Your shipment status has changed',
        icon: '/icons/notification-shipment.png',
        tag: `shipment-${data.shipmentId}`,
        data: { url: '/patient-portal/shipments', type },
        actions: [{ action: 'view', title: 'Track Shipment' }],
      };

    case NotificationTypes.APPOINTMENT_REMINDER:
      return {
        title: 'Appointment Reminder',
        body: `Your appointment is ${data.timeUntil || 'coming up soon'}`,
        icon: '/icons/notification-appointment.png',
        tag: `appointment-${data.appointmentId}`,
        data: { url: '/patient-portal/appointments', type },
        actions: [
          { action: 'view', title: 'View Details' },
          { action: 'join', title: 'Join Video' },
        ],
        requireInteraction: true,
      };

    case NotificationTypes.MESSAGE_RECEIVED:
      return {
        title: data.senderName as string || 'New Message',
        body: data.preview as string || 'You have a new message from your care team',
        icon: '/icons/notification-message.png',
        tag: 'message',
        data: { url: '/patient-portal/chat', type },
        actions: [{ action: 'view', title: 'Read Message' }],
      };

    case NotificationTypes.PROGRESS_SUMMARY:
      return {
        title: 'Weekly Progress Summary',
        body: data.summary as string || 'See how you did this week!',
        icon: '/icons/notification-progress.png',
        tag: 'progress-summary',
        data: { url: '/patient-portal/progress', type },
        actions: [{ action: 'view', title: 'View Progress' }],
      };

    case NotificationTypes.ACHIEVEMENT_UNLOCKED:
      return {
        title: '🎉 Achievement Unlocked!',
        body: data.achievementName as string || 'You earned a new achievement!',
        icon: '/icons/notification-achievement.png',
        tag: `achievement-${data.achievementId}`,
        data: { url: '/patient-portal/achievements', type },
        actions: [{ action: 'view', title: 'View Achievement' }],
      };

    case NotificationTypes.GOAL_REACHED:
      return {
        title: '🎯 Goal Reached!',
        body: data.goalName as string || 'Congratulations on reaching your goal!',
        icon: '/icons/notification-goal.png',
        tag: `goal-${data.goalId}`,
        data: { url: '/patient-portal/progress', type },
        actions: [{ action: 'view', title: 'View Progress' }],
      };

    default:
      return {
        title: 'Patient Portal',
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        tag: 'default',
        data: { url: '/patient-portal', type },
      };
  }
}

// Utility functions
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
