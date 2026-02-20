/**
 * Auth/Session Domain Types
 *
 * @module domains/auth/types
 */

export interface LoginInput {
  email: string;
  password: string;
  clinicId?: number;
  clinicCode?: string;
  rememberMe?: boolean;
}

export interface LoginResult {
  success: boolean;
  token: string;
  user: AuthenticatedUser;
  requiresClinicSelection?: boolean;
  availableClinics?: ClinicOption[];
  redirectUrl?: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  clinicId: number | null;
  providerId: number | null;
  patientId: number | null;
  affiliateId: number | null;
  permissions: string[];
}

export interface ClinicOption {
  id: number;
  name: string;
  subdomain?: string | null;
  role: string;
}

export interface SessionInfo {
  id: string;
  userId: number;
  clinicId: number | null;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface TokenPayload {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
  sessionId?: string;
  providerId?: number;
  patientId?: number;
  affiliateId?: number;
  permissions?: string[];
  tokenVersion?: number;
}
