export interface TelehealthSessionData {
  id: number;
  topic: string;
  scheduledAt: string;
  duration: number;
  status: string;
  joinUrl: string;
  hostUrl?: string;
  meetingId?: string;
  password?: string;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    dob?: string;
    email?: string;
    phone?: string;
  };
  appointment?: {
    id: number;
    title: string;
    reason: string;
  };
}

export type TelehealthPhase = 'queue' | 'lobby' | 'call' | 'postCall';

export interface DeviceStatus {
  camera: 'pending' | 'granted' | 'denied' | 'unavailable';
  microphone: 'pending' | 'granted' | 'denied' | 'unavailable';
  cameraStream?: MediaStream;
}

export interface PostCallData {
  session: TelehealthSessionData;
  duration: number;
  soapNote?: {
    id: number;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    medicalNecessity?: string;
    status: string;
  };
  transcript?: string;
}
