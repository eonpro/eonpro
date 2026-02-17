/**
 * Enterprise Failure-Mode Simulation Helpers
 *
 * Utilities to inject infrastructure failures into the auth middleware
 * test environment:
 *   - Redis down (validateSession throws)
 *   - DB down (basePrisma throws Prisma init/connection errors)
 *   - Missing Edge headers (x-clinic-id, x-clinic-subdomain absent)
 *
 * Each helper returns a teardown function to restore normal mocks.
 *
 * Usage:
 *   const teardown = simulateRedisDown();
 *   // ... run tests ...
 *   teardown();
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailureModeControls {
  /** Restore mocks to healthy state */
  teardown: () => void;
}

export interface MockState {
  sessionValid: boolean;
  sessionReason: string | undefined;
  sessionThrows: boolean;
  subdomainClinic: { id: number } | null;
  userClinicAccess: boolean;
  providerClinicAccess: boolean;
  dbThrows: boolean;
  dbErrorCode: string | undefined;
}

// ---------------------------------------------------------------------------
// Default healthy state
// ---------------------------------------------------------------------------

export function healthyState(): MockState {
  return {
    sessionValid: true,
    sessionReason: undefined,
    sessionThrows: false,
    subdomainClinic: null,
    userClinicAccess: false,
    providerClinicAccess: false,
    dbThrows: false,
    dbErrorCode: undefined,
  };
}

// ---------------------------------------------------------------------------
// Failure simulators
// ---------------------------------------------------------------------------

/**
 * Simulate Redis being unavailable.
 * validateSession will throw an ECONNREFUSED-style error.
 */
export function simulateRedisDown(state: MockState): FailureModeControls {
  const prev = { ...state };
  state.sessionThrows = true;
  return {
    teardown: () => {
      state.sessionThrows = prev.sessionThrows;
    },
  };
}

/**
 * Simulate the database being unreachable.
 * basePrisma calls will throw errors matching Prisma connection error patterns.
 */
export function simulateDbDown(state: MockState): FailureModeControls {
  const prev = { ...state };
  state.dbThrows = true;
  state.dbErrorCode = 'P2024'; // "Timed out fetching a new connection from the connection pool"
  return {
    teardown: () => {
      state.dbThrows = prev.dbThrows;
      state.dbErrorCode = prev.dbErrorCode;
    },
  };
}

/**
 * Simulate missing Edge middleware headers.
 * The request will have no x-clinic-id and no x-clinic-subdomain.
 * This tests how auth middleware handles absence of Edge-layer clinic context.
 */
export function simulateMissingEdgeHeaders(): Record<string, string> {
  // Return empty headers — caller should NOT add x-clinic-id or x-clinic-subdomain
  return {};
}

/**
 * Create a Prisma-like error that triggers isDatabaseConnectionError() detection.
 * Mimics PrismaClientKnownRequestError shape.
 */
export function createPrismaConnectionError(code: string = 'P2024'): Error {
  const err = new Error(`Timed out fetching a new connection from the connection pool (${code})`);
  (err as any).code = code;
  err.name = 'PrismaClientKnownRequestError';
  // Prisma errors also have clientVersion
  (err as any).clientVersion = '6.0.0';
  return err;
}

/**
 * Create a Prisma initialization error.
 */
export function createPrismaInitError(): Error {
  const err = new Error('Can\'t reach database server at `db.example.com`:`5432`');
  err.name = 'PrismaClientInitializationError';
  (err as any).clientVersion = '6.0.0';
  return err;
}

/**
 * Create a Redis connection error.
 */
export function createRedisConnectionError(): Error {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:6379');
  err.name = 'Error';
  (err as any).code = 'ECONNREFUSED';
  return err;
}
