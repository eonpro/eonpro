/**
 * Zoom Meeting Service
 *
 * Handles Zoom meeting creation, management, and participant control
 */

import { logger } from '@/lib/logger';
import {
  isZoomEnabled,
  zoomConfig,
  MeetingType,
  MeetingStatus,
  TELEHEALTH_SETTINGS,
  CONSULTATION_DURATIONS,
  ZOOM_ERRORS,
} from './config';
// import { prisma } from '@/lib/db'; // Uncomment when telehealthSession table is added
import crypto from 'crypto';

// Meeting creation interface
export interface CreateMeetingParams {
  topic: string;
  duration: number;
  patientId: number;
  providerId: number;
  scheduledAt?: Date;
  agenda?: string;
  password?: string;
  settings?: any;
}

// Meeting response interface
export interface ZoomMeetingResponse {
  id: number;
  uuid: string;
  hostId: string;
  topic: string;
  type: number;
  status: string;
  startTime?: string;
  duration: number;
  timezone?: string;
  agenda?: string;
  createdAt: string;
  startUrl: string;
  joinUrl: string;
  password?: string;
  h323Password?: string;
  pstnPassword?: string;
  encryptedPassword?: string;
  settings?: any;
}

// Participant interface
export interface ZoomParticipant {
  id: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  joinTime: Date;
  leaveTime?: Date;
  duration?: number;
  attentiveness?: number;
  role: 'host' | 'cohost' | 'participant';
  status: 'in_meeting' | 'waiting' | 'left';
}

// Generate Zoom JWT for API calls (Server-side only)
export async function generateZoomJWT(): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error('generateZoomJWT can only be called on the server side');
  }

  // Only generate real JWT if configured
  if (!isZoomEnabled()) {
    return 'mock_jwt_token';
  }

  try {
    const { default: jwt } = await import('jsonwebtoken');

    const payload = {
      iss: zoomConfig.clientId,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };

    return jwt.sign(payload, zoomConfig.clientSecret, { algorithm: 'HS256' });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to generate JWT:', error);
    return '';
  }
}

// Get OAuth access token
export async function getZoomAccessToken(): Promise<string> {
  if (!isZoomEnabled()) {
    return 'mock_access_token';
  }

  try {
    const credentials = Buffer.from(`${zoomConfig.clientId}:${zoomConfig.clientSecret}`).toString(
      'base64'
    );

    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=account_credentials&account_id=${zoomConfig.accountId}`,
    });

    if (!response.ok) {
      throw new Error('Failed to get access token');
    }

    const data = await response.json();
    return data.access_token;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to get access token:', error);
    throw error;
  }
}

// Create a Zoom meeting
export async function createZoomMeeting(params: CreateMeetingParams): Promise<ZoomMeetingResponse> {
  if (!isZoomEnabled()) {
    // Return mock meeting for development
    return createMockMeeting(params);
  }

  try {
    const accessToken = await getZoomAccessToken();

    const meetingData = {
      topic: params.topic,
      type: params.scheduledAt ? MeetingType.SCHEDULED : MeetingType.INSTANT,
      start_time: params.scheduledAt?.toISOString(),
      duration: params.duration,
      timezone: 'America/New_York',
      password: params.password || generateMeetingPassword(),
      agenda: params.agenda || `Telehealth consultation`,
      settings: {
        ...TELEHEALTH_SETTINGS,
        ...params.settings,
      },
    };

    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meetingData),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('[ZOOM] Meeting creation failed:', error);
      throw new Error(ZOOM_ERRORS.MEETING_CREATE_FAILED);
    }

    const meeting = await response.json();

    // Store meeting in database (would create telehealthSession in production)
    // Commented out as table doesn't exist yet
    /*
    try {
      await prisma.telehealthSession.create({
        data: {
          meetingId: meeting.id.toString(),
          meetingUrl: meeting.join_url,
          providerUrl: meeting.start_url,
          patientId: params.patientId,
          providerId: params.providerId,
          scheduledAt: params.scheduledAt || new Date(),
          duration: params.duration,
          status: 'scheduled',
          metadata: meeting,
        },
      });
    } catch (dbError: any) {
      logger.debug('[ZOOM] Database save skipped:', { value: dbError });
    }
    */
    logger.debug('[ZOOM] Meeting created (database save skipped - table not configured)');

    return meeting;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Meeting creation error:', error);
    throw error;
  }
}

// Get meeting details
export async function getZoomMeeting(meetingId: string): Promise<ZoomMeetingResponse | null> {
  if (!isZoomEnabled()) {
    return createMockMeeting({
      topic: 'Mock Meeting',
      duration: 30,
      patientId: 1,
      providerId: 1,
    });
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(ZOOM_ERRORS.MEETING_NOT_FOUND);
      }
      throw new Error('Failed to get meeting details');
    }

    return await response.json();
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to get meeting:', error);
    return null;
  }
}

// Update meeting
export async function updateZoomMeeting(
  meetingId: string,
  updates: Partial<CreateMeetingParams>
): Promise<boolean> {
  if (!isZoomEnabled()) {
    return true; // Mock success
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: updates.topic,
        start_time: updates.scheduledAt?.toISOString(),
        duration: updates.duration,
        agenda: updates.agenda,
        settings: updates.settings,
      }),
    });

    return response.ok;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to update meeting:', error);
    return false;
  }
}

// Delete/Cancel meeting
export async function cancelZoomMeeting(meetingId: string): Promise<boolean> {
  if (!isZoomEnabled()) {
    return true; // Mock success
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      // Update database status (would update telehealthSession in production)
      /*
      try {
        await prisma.telehealthSession.updateMany({
          where: { meetingId },
          data: { status: 'cancelled' },
        });
      } catch (dbError: any) {
        logger.debug('[ZOOM] Database update skipped:', { value: dbError });
      }
      */
      logger.debug('[ZOOM] Meeting cancelled (database update skipped - table not configured)');
    }

    return response.ok;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to cancel meeting:', error);
    return false;
  }
}

// Get meeting participants
export async function getMeetingParticipants(meetingId: string): Promise<ZoomParticipant[]> {
  if (!isZoomEnabled()) {
    // Return mock participants
    return [
      {
        id: 'mock-host',
        userName: 'Dr. Smith',
        role: 'host',
        status: 'in_meeting',
        joinTime: new Date(),
      },
      {
        id: 'mock-patient',
        userName: 'John Doe',
        role: 'participant',
        status: 'waiting',
        joinTime: new Date(),
      },
    ];
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(
      `https://api.zoom.us/v2/metrics/meetings/${meetingId}/participants`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.participants || [];
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to get participants:', error);
    return [];
  }
}

// Admit participant from waiting room
export async function admitParticipant(meetingId: string, participantId: string): Promise<boolean> {
  if (!isZoomEnabled()) {
    return true; // Mock success
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(
      `https://api.zoom.us/v2/meetings/${meetingId}/participants/${participantId}/admit`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.ok;
  } catch (error: any) {
    // @ts-ignore

    logger.error('[ZOOM] Failed to admit participant:', error);
    return false;
  }
}

// Generate meeting password
function generateMeetingPassword(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate SDK signature for client-side SDK
export function generateZoomSignature(
  meetingNumber: string,
  role: number = 0 // 0 = participant, 1 = host
): string {
  if (!zoomConfig.sdkKey || !zoomConfig.sdkSecret) {
    return 'mock_signature';
  }

  const timestamp = new Date().getTime() - 30000;
  const msg = Buffer.from(zoomConfig.sdkKey + meetingNumber + timestamp + role).toString('base64');

  const hash = crypto.createHmac('sha256', zoomConfig.sdkSecret).update(msg).digest('base64');

  const signature = Buffer.from(
    `${zoomConfig.sdkKey}.${meetingNumber}.${timestamp}.${role}.${hash}`
  ).toString('base64');

  return signature;
}

// Create mock meeting for development
function createMockMeeting(params: CreateMeetingParams): ZoomMeetingResponse {
  const meetingId = Math.floor(Math.random() * 1000000000);
  const password = generateMeetingPassword();

  return {
    id: meetingId,
    uuid: `mock-${meetingId}`,
    hostId: 'mock-host',
    topic: params.topic,
    type: MeetingType.INSTANT,
    status: 'waiting',
    duration: params.duration,
    createdAt: new Date().toISOString(),
    startUrl: `https://zoom.us/s/${meetingId}?zak=mock`,
    joinUrl: `https://zoom.us/j/${meetingId}?pwd=${password}`,
    password,
    settings: TELEHEALTH_SETTINGS,
  };
}

// Export mock service for testing
export const mockZoomService = {
  createMeeting: createMockMeeting,
  getMeeting: () =>
    createMockMeeting({
      topic: 'Mock Consultation',
      duration: 30,
      patientId: 1,
      providerId: 1,
    }),
  cancelMeeting: () => true,
  getParticipants: () => [],
  admitParticipant: () => true,
};
