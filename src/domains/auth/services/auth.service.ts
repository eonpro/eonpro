/**
 * Authentication Service
 * ======================
 *
 * Core authentication business logic extracted from the 1,204-line login route.
 * Handles credential verification, multi-clinic user resolution, session creation,
 * and JWT token generation.
 *
 * The route handler (api/auth/login/route.ts) remains as a thin controller that:
 *   1. Validates input
 *   2. Calls this service
 *   3. Sets cookies
 *   4. Returns the response
 *
 * @module domains/auth/services
 */

import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { LoginInput, LoginResult, AuthenticatedUser, ClinicOption, TokenPayload } from '../types';

export interface AuthService {
  /**
   * Verify user credentials and resolve clinic context.
   * Returns user info + token payload ready for JWT signing.
   * Does NOT generate JWT or set cookies (that's the route's job).
   */
  verifyCredentials(input: LoginInput): Promise<CredentialResult>;

  /**
   * Resolve available clinics for a user who belongs to multiple clinics.
   */
  resolveUserClinics(userId: number): Promise<ClinicOption[]>;

  /**
   * Validate that a user has access to a specific clinic.
   */
  validateClinicAccess(userId: number, clinicId: number): Promise<boolean>;
}

export interface CredentialResult {
  success: boolean;
  user?: AuthenticatedUser;
  tokenPayload?: TokenPayload;
  requiresClinicSelection?: boolean;
  availableClinics?: ClinicOption[];
  error?: string;
  errorCode?: string;
}

export function createAuthService(): AuthService {
  return {
    async verifyCredentials(input: LoginInput): Promise<CredentialResult> {
      const email = input.email.toLowerCase().trim();

      // Look up user by email
      const user = await basePrisma.user.findFirst({
        where: { email },
        include: {
          userClinics: {
            where: { isActive: true },
            include: {
              clinic: { select: { id: true, name: true, subdomain: true } },
            },
          },
        },
      });

      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
          errorCode: 'INVALID_CREDENTIALS',
        };
      }

      // Check account lockout
      if ((user as any).isLocked) {
        return {
          success: false,
          error: 'Account is locked. Please contact your administrator.',
          errorCode: 'ACCOUNT_LOCKED',
        };
      }

      // Verify password (delegated to bcrypt — caller should have already done this,
      // but this is the domain boundary for the logic)
      // NOTE: Actual password verification remains in the route for now to avoid
      // importing bcrypt here. This service focuses on post-verification logic.

      // Resolve clinics
      const clinics: ClinicOption[] = (user.userClinics || []).map((uc: any) => ({
        id: uc.clinic.id,
        name: uc.clinic.name,
        subdomain: uc.clinic.subdomain,
        role: uc.role || user.role,
      }));

      // If user has multiple clinics and no specific clinic was requested, require selection
      if (clinics.length > 1 && !input.clinicId) {
        return {
          success: true,
          requiresClinicSelection: true,
          availableClinics: clinics,
          user: mapToAuthenticatedUser(user, null),
        };
      }

      // Resolve target clinic
      const targetClinicId = input.clinicId || clinics[0]?.id || user.clinicId;

      // Build token payload
      const tokenPayload: TokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: targetClinicId ?? undefined,
        providerId: user.providerId ?? undefined,
        patientId: user.patientId ?? undefined,
      };

      return {
        success: true,
        user: mapToAuthenticatedUser(user, targetClinicId),
        tokenPayload,
      };
    },

    async resolveUserClinics(userId: number): Promise<ClinicOption[]> {
      const userClinics = await basePrisma.userClinic.findMany({
        where: { userId, isActive: true },
        include: {
          clinic: { select: { id: true, name: true, subdomain: true } },
        },
      });

      return userClinics.map((uc: any) => ({
        id: uc.clinic.id,
        name: uc.clinic.name,
        subdomain: uc.clinic.subdomain,
        role: uc.role,
      }));
    },

    async validateClinicAccess(userId: number, clinicId: number): Promise<boolean> {
      const assignment = await basePrisma.userClinic.findFirst({
        where: { userId, clinicId, isActive: true },
        select: { id: true },
      });
      return !!assignment;
    },
  };
}

function mapToAuthenticatedUser(user: any, clinicId: number | null | undefined): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    clinicId: clinicId ?? user.clinicId ?? null,
    providerId: user.providerId ?? null,
    patientId: user.patientId ?? null,
    affiliateId: user.affiliateId ?? null,
    permissions: user.permissions ?? [],
  };
}

export const authService = createAuthService();
