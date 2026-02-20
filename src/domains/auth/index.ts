/**
 * Auth Domain
 *
 * @module domains/auth
 */

export { authService, createAuthService } from './services/auth.service';
export type { AuthService, CredentialResult } from './services/auth.service';
export type {
  LoginInput,
  LoginResult,
  AuthenticatedUser,
  ClinicOption,
  SessionInfo,
  TokenPayload,
} from './types';
