/**
 * Zoom Telehealth Configuration
 *
 * Handles Zoom SDK/API setup for virtual consultations
 */

import { isFeatureEnabled } from '@/lib/features';

// Zoom Configuration Interface
export interface ZoomConfig {
  clientId: string;
  clientSecret: string;
  sdkKey: string;
  sdkSecret: string;
  verificationToken: string;
  webhookSecret: string;
  accountId: string;
}

// Load configuration from environment
export const zoomConfig: ZoomConfig = {
  clientId: process.env.ZOOM_CLIENT_ID || '',
  clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
  sdkKey: process.env.ZOOM_SDK_KEY || '',
  sdkSecret: process.env.ZOOM_SDK_SECRET || '',
  verificationToken: process.env.ZOOM_VERIFICATION_TOKEN || '',
  webhookSecret: process.env.ZOOM_WEBHOOK_SECRET || '',
  accountId: process.env.ZOOM_ACCOUNT_ID || '',
};

// Validate Zoom configuration
export function isZoomConfigured(): boolean {
  return !!(zoomConfig.clientId && zoomConfig.clientSecret && zoomConfig.accountId);
}

// Check if Zoom is enabled and configured
export function isZoomEnabled(): boolean {
  return isFeatureEnabled('ZOOM_TELEHEALTH') && isZoomConfigured();
}

// Check if waiting room is enabled
export function isWaitingRoomEnabled(): boolean {
  return isFeatureEnabled('ZOOM_WAITING_ROOM');
}

// Meeting Types
export enum MeetingType {
  INSTANT = 1,
  SCHEDULED = 2,
  RECURRING_NO_TIME = 3,
  RECURRING_WITH_TIME = 8,
}

// Meeting Status
export enum MeetingStatus {
  WAITING = 'waiting',
  STARTED = 'started',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

// Participant Types
export enum ParticipantType {
  PATIENT = 'patient',
  PROVIDER = 'provider',
  ADMIN = 'admin',
  GUEST = 'guest',
}

// Zoom Meeting Settings
export interface ZoomMeetingSettings {
  hostVideo: boolean;
  participantVideo: boolean;
  audioOption: 'both' | 'telephony' | 'voip';
  joinBeforeHost: boolean;
  muteUponEntry: boolean;
  watermark: boolean;
  usePmi: boolean;
  approvalType: 0 | 1 | 2; // 0=auto, 1=manual, 2=no registration
  registrationType: number;
  enforceLogin: boolean;
  enforceLoginDomains: string;
  alternativeHosts: string;
  closeRegistration: boolean;
  waitingRoom: boolean;
  globalDialInCountries: string[];
  contactName: string;
  contactEmail: string;
  registrantsEmailNotification: boolean;
  meetingAuthentication: boolean;
  authenticationOption: string;
  authenticationDomains: string;
  autoRecording: 'none' | 'local' | 'cloud';
  alternativeHostsEmailNotification: boolean;
  showShareButton: boolean;
  allowMultipleDevices: boolean;
  encryptionType: 'enhanced_encryption' | 'e2ee';
  breakoutRoom?: {
    enable: boolean;
    rooms: number;
  };
}

// Default meeting settings for telehealth
export const TELEHEALTH_SETTINGS: Partial<ZoomMeetingSettings> = {
  hostVideo: true,
  participantVideo: true,
  audioOption: 'both',
  joinBeforeHost: false,
  muteUponEntry: true,
  waitingRoom: true,
  enforceLogin: false,
  autoRecording: 'cloud', // Record for compliance (with consent)
  encryptionType: 'enhanced_encryption',
  watermark: true,
  showShareButton: true, // For sharing medical images
  allowMultipleDevices: false,
};

// Meeting Duration Presets (in minutes)
export const CONSULTATION_DURATIONS = {
  QUICK_CHECK: 15,
  STANDARD: 30,
  EXTENDED: 45,
  COMPREHENSIVE: 60,
};

// Zoom SDK Configuration
export const ZOOM_SDK_CONFIG = {
  leaveUrl: '/telehealth/ended',
  isSupportAV: true,
  isSupportChat: true,
  isSupportQA: false,
  isSupportCC: false,
  isSupportPolling: false,
  isSupportBreakout: false,
  screenShare: true,
  videoHeader: true,
  isLockBottom: false,
  isSupportNonverbal: true,
  disableRecord: false, // Allow recording with consent
  disableJoinAudio: false,
};

// Webhook Event Types
export const ZOOM_WEBHOOK_EVENTS = {
  MEETING_STARTED: 'meeting.started',
  MEETING_ENDED: 'meeting.ended',
  MEETING_PARTICIPANT_JOINED: 'meeting.participant_joined',
  MEETING_PARTICIPANT_LEFT: 'meeting.participant_left',
  MEETING_REGISTRATION_CREATED: 'meeting.registration_created',
  RECORDING_COMPLETED: 'recording.completed',
  PARTICIPANT_WAITING: 'meeting.participant_waiting',
};

// Error Messages
export const ZOOM_ERRORS = {
  NOT_CONFIGURED: 'Zoom is not configured. Please add API credentials.',
  NOT_ENABLED: 'Zoom Telehealth feature is not enabled.',
  MEETING_CREATE_FAILED: 'Failed to create meeting. Please try again.',
  MEETING_NOT_FOUND: 'Meeting not found.',
  INVALID_CREDENTIALS: 'Invalid Zoom credentials.',
  PARTICIPANT_LIMIT: 'Meeting has reached maximum participants.',
  RECORDING_FAILED: 'Failed to start recording.',
  WAITING_ROOM_FULL: 'Waiting room is at capacity.',
  CONNECTION_FAILED: 'Failed to connect to meeting.',
  BROWSER_NOT_SUPPORTED: 'Your browser does not support video calls.',
};
