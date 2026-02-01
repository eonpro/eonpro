/**
 * iCal Service
 * 
 * Generates iCal (ICS) feeds for calendar subscriptions.
 * Supports Apple Calendar, Google Calendar, and other iCal-compatible apps.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AppointmentStatus } from '@prisma/client';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  created: Date;
  lastModified: Date;
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  organizer?: {
    name: string;
    email?: string;
  };
  attendees?: Array<{
    name: string;
    email?: string;
    rsvp?: boolean;
  }>;
  url?: string;
  categories?: string[];
  alarm?: {
    minutesBefore: number;
    description: string;
  };
}

export interface ICalFeedOptions {
  includePatientNames?: boolean;
  includeMeetingLinks?: boolean;
  syncRangeDays?: number;
  calendarName?: string;
  timezone?: string;
}

// ============================================================================
// iCal Generation
// ============================================================================

/**
 * Escape special characters in iCal values
 */
function escapeICalValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format date for iCal (YYYYMMDDTHHMMSSZ for UTC)
 */
function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Format date with timezone for iCal
 */
function formatICalDateWithTZ(date: Date, timezone: string): string {
  // For simplicity, we'll use UTC format
  // In production, use a library like luxon for proper timezone handling
  return formatICalDate(date);
}

/**
 * Generate unique ID for iCal event
 */
function generateEventUID(appointmentId: number, domain: string = 'eonhealth.app'): string {
  return `appointment-${appointmentId}@${domain}`;
}

/**
 * Generate a single iCal event string
 */
function generateICalEvent(event: ICalEvent, timezone: string = 'UTC'): string {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatICalDate(new Date())}`,
    `DTSTART:${formatICalDate(event.startTime)}`,
    `DTEND:${formatICalDate(event.endTime)}`,
    `SUMMARY:${escapeICalValue(event.summary)}`,
    `CREATED:${formatICalDate(event.created)}`,
    `LAST-MODIFIED:${formatICalDate(event.lastModified)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalValue(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalValue(event.location)}`);
  }

  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }

  if (event.organizer) {
    const orgLine = event.organizer.email
      ? `ORGANIZER;CN=${escapeICalValue(event.organizer.name)}:mailto:${event.organizer.email}`
      : `ORGANIZER;CN=${escapeICalValue(event.organizer.name)}:`;
    lines.push(orgLine);
  }

  if (event.attendees) {
    for (const attendee of event.attendees) {
      const attLine = attendee.email
        ? `ATTENDEE;CN=${escapeICalValue(attendee.name)};RSVP=${attendee.rsvp ? 'TRUE' : 'FALSE'}:mailto:${attendee.email}`
        : `ATTENDEE;CN=${escapeICalValue(attendee.name)}:`;
      lines.push(attLine);
    }
  }

  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.join(',')}`);
  }

  if (event.alarm) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICalValue(event.alarm.description)}`);
    lines.push(`TRIGGER:-PT${event.alarm.minutesBefore}M`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

/**
 * Generate complete iCal feed
 */
export function generateICalFeed(
  events: ICalEvent[],
  options: {
    calendarName: string;
    calendarDescription?: string;
    timezone?: string;
    refreshInterval?: number; // minutes
  }
): string {
  const timezone = options.timezone || 'America/New_York';
  const refreshInterval = options.refreshInterval || 60;

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EON Health//Appointment Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalValue(options.calendarName)}`,
    `X-WR-TIMEZONE:${timezone}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshInterval}M`,
    `X-PUBLISHED-TTL:PT${refreshInterval}M`,
  ];

  if (options.calendarDescription) {
    header.push(`X-WR-CALDESC:${escapeICalValue(options.calendarDescription)}`);
  }

  const eventStrings = events.map(e => generateICalEvent(e, timezone));

  const footer = ['END:VCALENDAR'];

  return [...header, ...eventStrings, ...footer].join('\r\n');
}

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Generate a secure subscription token
 */
export function generateSubscriptionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a calendar subscription for a provider
 */
export async function createCalendarSubscription(
  providerId: number,
  clinicId?: number,
  options?: {
    name?: string;
    includePatientNames?: boolean;
    includeMeetingLinks?: boolean;
    syncRangeDays?: number;
  }
) {
  const token = generateSubscriptionToken();

  const subscription = await prisma.calendarSubscription.create({
    data: {
      providerId,
      clinicId,
      token,
      name: options?.name || 'Appointments',
      includePatientNames: options?.includePatientNames ?? false,
      includeMeetingLinks: options?.includeMeetingLinks ?? true,
      syncRangeDays: options?.syncRangeDays ?? 90,
    }
  });

  logger.info('Calendar subscription created', {
    subscriptionId: subscription.id,
    providerId,
    clinicId,
  });

  return subscription;
}

/**
 * Get subscription by token
 */
export async function getSubscriptionByToken(token: string) {
  return prisma.calendarSubscription.findUnique({
    where: { token },
    include: {
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        }
      }
    }
  });
}

/**
 * Update subscription access tracking
 */
export async function trackSubscriptionAccess(subscriptionId: number) {
  await prisma.calendarSubscription.update({
    where: { id: subscriptionId },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 }
    }
  });
}

/**
 * Delete a calendar subscription
 */
export async function deleteCalendarSubscription(subscriptionId: number) {
  await prisma.calendarSubscription.delete({
    where: { id: subscriptionId }
  });

  logger.info('Calendar subscription deleted', { subscriptionId });
}

// ============================================================================
// Feed Generation
// ============================================================================

/**
 * Generate iCal feed for a provider's appointments
 */
export async function generateProviderICalFeed(
  token: string
): Promise<{ feed: string; contentType: string } | null> {
  // Get subscription
  const subscription = await getSubscriptionByToken(token);
  
  if (!subscription || !subscription.isActive) {
    return null;
  }

  // Track access
  await trackSubscriptionAccess(subscription.id);

  // Calculate date range
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // Include past week
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + subscription.syncRangeDays);

  // Get appointments
  const appointments = await prisma.appointment.findMany({
    where: {
      providerId: subscription.providerId,
      ...(subscription.clinicId && { clinicId: subscription.clinicId }),
      startTime: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        notIn: [AppointmentStatus.CANCELLED]
      }
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        }
      },
      appointmentType: {
        select: {
          name: true,
          duration: true,
        }
      }
    },
    orderBy: { startTime: 'asc' }
  });

  // Convert to iCal events
  const events: ICalEvent[] = appointments.map((apt: any) => {
    // Generate summary (HIPAA compliant)
    let summary = apt.appointmentType?.name || apt.title || 'Appointment';
    if (subscription.includePatientNames && apt.patient) {
      summary = `${summary} - ${apt.patient.firstName} ${apt.patient.lastName}`;
    }

    // Generate description
    const descriptionParts: string[] = [];
    if (apt.reason) {
      descriptionParts.push(`Reason: ${apt.reason}`);
    }
    if (apt.notes) {
      descriptionParts.push(`Notes: ${apt.notes}`);
    }
    if (subscription.includeMeetingLinks && apt.zoomJoinUrl) {
      descriptionParts.push(`Video Link: ${apt.zoomJoinUrl}`);
    }

    // Determine location
    let location = apt.location || '';
    if (apt.type === 'VIDEO' && subscription.includeMeetingLinks && apt.zoomJoinUrl) {
      location = apt.zoomJoinUrl;
    }

    // Map status
    let status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED';
    if (apt.status === AppointmentStatus.SCHEDULED) {
      status = 'TENTATIVE';
    } else if (apt.status === AppointmentStatus.CONFIRMED) {
      status = 'CONFIRMED';
    }

    return {
      uid: generateEventUID(apt.id),
      summary,
      description: descriptionParts.length > 0 ? descriptionParts.join('\\n') : undefined,
      location: location || undefined,
      startTime: apt.startTime,
      endTime: apt.endTime,
      created: apt.createdAt,
      lastModified: apt.updatedAt,
      status,
      categories: [apt.type || 'IN_PERSON'],
      url: subscription.includeMeetingLinks ? apt.zoomJoinUrl || undefined : undefined,
      alarm: {
        minutesBefore: 15,
        description: `Appointment in 15 minutes: ${summary}`,
      }
    };
  });

  // Generate feed
  const provider = subscription.provider;
  const calendarName = subscription.name || 
    `${provider.firstName} ${provider.lastName} - Appointments`;

  const feed = generateICalFeed(events, {
    calendarName,
    calendarDescription: `Appointment schedule for ${provider.firstName} ${provider.lastName}`,
    timezone: 'America/New_York',
    refreshInterval: 30, // 30 minutes
  });

  return {
    feed,
    contentType: 'text/calendar; charset=utf-8',
  };
}

/**
 * Generate iCal file for a single appointment
 */
export async function generateAppointmentICS(
  appointmentId: number,
  includePatientName: boolean = false
): Promise<string | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        }
      },
      provider: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        }
      },
      appointmentType: {
        select: { name: true }
      }
    }
  });

  if (!appointment) {
    return null;
  }

  let summary = appointment.appointmentType?.name || appointment.title || 'Appointment';
  if (includePatientName && appointment.patient) {
    summary = `${summary} - ${appointment.patient.firstName} ${appointment.patient.lastName}`;
  }

  const descriptionParts: string[] = [];
  if (appointment.reason) descriptionParts.push(`Reason: ${appointment.reason}`);
  if (appointment.notes) descriptionParts.push(`Notes: ${appointment.notes}`);
  if (appointment.zoomJoinUrl) descriptionParts.push(`Video Link: ${appointment.zoomJoinUrl}`);

  const event: ICalEvent = {
    uid: generateEventUID(appointment.id),
    summary,
    description: descriptionParts.join('\\n') || undefined,
    location: appointment.location || appointment.zoomJoinUrl || undefined,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    created: appointment.createdAt,
    lastModified: appointment.updatedAt,
    status: 'CONFIRMED',
    organizer: appointment.provider ? {
      name: `${appointment.provider.firstName} ${appointment.provider.lastName}`,
      email: appointment.provider.email || undefined,
    } : undefined,
    alarm: {
      minutesBefore: 15,
      description: `Appointment reminder: ${summary}`,
    }
  };

  return generateICalFeed([event], {
    calendarName: 'EON Health Appointment',
    timezone: 'America/New_York',
  });
}
