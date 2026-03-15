/**
 * Zoom Meeting Service
 *
 * Handles Zoom meeting creation, management, and participant control.
 * Uses Server-to-Server OAuth (account_credentials grant) for API access.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  isZoomConfigured,
  zoomConfig,
  MeetingType,
  TELEHEALTH_SETTINGS,
  ZOOM_ERRORS,
} from './config';
import crypto from 'crypto';

const ZOOM_API_TIMEOUT_MS = 15_000;

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

// ============================================================================
// Token Cache — prevents re-fetching on every API call
// ============================================================================

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt: number = 0;

/**
 * Get OAuth access token using Server-to-Server (account_credentials) grant.
 * Caches the token in memory with a 5-minute safety buffer.
 */
export async function getZoomAccessToken(): Promise<string> {
  if (!isZoomConfigured()) {
    return 'mock_access_token';
  }

  if (cachedAccessToken && Date.now() < cachedTokenExpiresAt) {
    return cachedAccessToken;
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
      signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OAuth token request failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    cachedAccessToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

    return data.access_token;
  } catch (error) {
    logger.error('[ZOOM] Failed to get access token', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// ============================================================================
// Meeting CRUD
// ============================================================================

export async function createZoomMeeting(params: CreateMeetingParams): Promise<ZoomMeetingResponse> {
  if (!isZoomConfigured()) {
    return createMockMeeting(params);
  }

  try {
    const accessToken = await getZoomAccessToken();

    let clinicTimezone = 'America/New_York';
    if (params.patientId) {
      try {
        const patient = await prisma.patient.findUnique({
          where: { id: params.patientId },
          select: { clinic: { select: { timezone: true } } },
        });
        if (patient?.clinic?.timezone) {
          clinicTimezone = patient.clinic.timezone;
        }
      } catch {
        // Fall back to default timezone
      }
    }

    const meetingData = {
      topic: params.topic,
      type: params.scheduledAt ? MeetingType.SCHEDULED : MeetingType.INSTANT,
      start_time: params.scheduledAt?.toISOString(),
      duration: params.duration,
      timezone: clinicTimezone,
      password: params.password || generateMeetingPassword(),
      agenda: params.agenda || 'Telehealth consultation',
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
      signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('[ZOOM] Meeting creation failed', { status: response.status, error });
      throw new Error(ZOOM_ERRORS.MEETING_CREATE_FAILED);
    }

    const raw = await response.json();

    const meeting: ZoomMeetingResponse = {
      id: raw.id,
      uuid: raw.uuid,
      hostId: raw.host_id,
      topic: raw.topic,
      type: raw.type,
      status: raw.status || 'waiting',
      startTime: raw.start_time,
      duration: raw.duration,
      timezone: raw.timezone,
      agenda: raw.agenda,
      createdAt: raw.created_at || new Date().toISOString(),
      startUrl: raw.start_url,
      joinUrl: raw.join_url,
      password: raw.password,
      h323Password: raw.h323_password,
      pstnPassword: raw.pstn_password,
      encryptedPassword: raw.encrypted_password,
      settings: raw.settings,
    };

    return meeting;
  } catch (error) {
    logger.error('[ZOOM] Meeting creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function getZoomMeeting(meetingId: string): Promise<ZoomMeetingResponse | null> {
  if (!isZoomConfigured()) {
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
      signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(ZOOM_ERRORS.MEETING_NOT_FOUND);
      }
      throw new Error('Failed to get meeting details');
    }

    const raw = await response.json();
    return {
      id: raw.id,
      uuid: raw.uuid,
      hostId: raw.host_id,
      topic: raw.topic,
      type: raw.type,
      status: raw.status,
      startTime: raw.start_time,
      duration: raw.duration,
      timezone: raw.timezone,
      agenda: raw.agenda,
      createdAt: raw.created_at || '',
      startUrl: raw.start_url,
      joinUrl: raw.join_url,
      password: raw.password,
      settings: raw.settings,
    };
  } catch (error) {
    logger.error('[ZOOM] Failed to get meeting', {
      meetingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

export async function updateZoomMeeting(
  meetingId: string,
  updates: Partial<CreateMeetingParams>
): Promise<boolean> {
  if (!isZoomConfigured()) {
    return true;
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
      signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
    });

    return response.ok;
  } catch (error) {
    logger.error('[ZOOM] Failed to update meeting', {
      meetingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function cancelZoomMeeting(meetingId: string): Promise<boolean> {
  if (!isZoomConfigured()) {
    return true;
  }

  try {
    const accessToken = await getZoomAccessToken();

    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
    });

    if (response.ok || response.status === 204) {
      try {
        await prisma.telehealthSession.updateMany({
          where: { meetingId },
          data: { status: 'CANCELLED' },
        });
      } catch (dbError) {
        logger.error('[ZOOM] Failed to update meeting status in database', {
          meetingId,
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
        });
      }
    }

    return response.ok || response.status === 204;
  } catch (error) {
    logger.error('[ZOOM] Failed to cancel meeting', {
      meetingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function getMeetingParticipants(meetingId: string): Promise<ZoomParticipant[]> {
  if (!isZoomConfigured()) {
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
        signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.participants || [];
  } catch (error) {
    logger.error('[ZOOM] Failed to get participants', {
      meetingId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

export async function admitParticipant(meetingId: string, participantId: string): Promise<boolean> {
  if (!isZoomConfigured()) {
    return true;
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
        signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
      }
    );

    return response.ok;
  } catch (error) {
    logger.error('[ZOOM] Failed to admit participant', {
      meetingId,
      participantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateMeetingPassword(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

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
