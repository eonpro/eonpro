/**
 * Patient ID Generator
 * ====================
 *
 * Centralized utility for generating clinic-specific patient IDs.
 * Format: {PREFIX}-{NUMBER} (e.g., EON-123, WEL-456, OT-789)
 *
 * Features:
 * - Atomic counter increment using database upsert
 * - Clinic-specific prefixes (configurable per clinic)
 * - Collision detection and resync on conflict
 * - Fallback ID generation using timestamps
 *
 * @module lib/patients/patientIdGenerator
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Options for generating a patient ID
 */
export interface GeneratePatientIdOptions {
  /**
   * Maximum number of retries on ID conflict
   * @default 5
   */
  maxRetries?: number;

  /**
   * Delay between retries in milliseconds
   * @default 100
   */
  retryDelay?: number;
}

/**
 * Result of patient ID generation
 */
export interface GeneratePatientIdResult {
  /**
   * The generated patient ID (e.g., "EON-123" or "456" if no prefix)
   */
  patientId: string;

  /**
   * The clinic prefix used (e.g., "EON") or null if none
   */
  prefix: string | null;

  /**
   * The numeric sequence number
   */
  sequenceNumber: number;
}

/**
 * Generate a new patient ID for the specified clinic.
 *
 * The ID format is {PREFIX}-{NUMBER} where:
 * - PREFIX is the clinic's patientIdPrefix (e.g., "EON", "WEL", "OT")
 * - NUMBER is a sequentially incrementing integer
 *
 * If the clinic has no prefix configured, returns just the number.
 *
 * @param clinicId - The clinic ID to generate a patient ID for
 * @param options - Optional configuration
 * @returns The generated patient ID string
 *
 * @example
 * // Clinic with prefix "EON"
 * const id = await generatePatientId(1);
 * // Returns: "EON-123"
 *
 * @example
 * // Clinic without prefix
 * const id = await generatePatientId(2);
 * // Returns: "456"
 */
export async function generatePatientId(
  clinicId: number,
  options: GeneratePatientIdOptions = {}
): Promise<string> {
  const { maxRetries = 5, retryDelay = 100 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generatePatientIdInternal(clinicId);
      return result.patientId;
    } catch (error) {
      lastError = error as Error;

      // Check if it's a unique constraint violation (P2002)
      const prismaError = error as { code?: string; meta?: { target?: string[] } };
      if (prismaError.code === 'P2002' && prismaError.meta?.target?.includes('patientId')) {
        logger.warn(`[PatientIdGenerator] ID conflict on attempt ${attempt + 1}/${maxRetries + 1}`, {
          clinicId,
          error: prismaError.code,
        });

        // On conflict, try to resync the counter
        if (attempt >= 2) {
          await resyncPatientCounter(clinicId);
        }

        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // All retries exhausted, generate fallback ID
  logger.error(`[PatientIdGenerator] All retries exhausted, using fallback ID`, {
    clinicId,
    error: lastError?.message,
  });

  return generateFallbackId(clinicId);
}

/**
 * Internal function to generate patient ID with full result details
 */
async function generatePatientIdInternal(clinicId: number): Promise<GeneratePatientIdResult> {
  // Get the clinic's prefix in the same query as counter update for efficiency
  const [clinic, counter] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { patientIdPrefix: true },
    }),
    prisma.patientCounter.upsert({
      where: { clinicId },
      create: { clinicId, current: 1 },
      update: { current: { increment: 1 } },
    }),
  ]);

  const prefix = clinic?.patientIdPrefix ?? null;
  const sequenceNumber = counter.current;

  // Format the patient ID
  const patientId = prefix ? `${prefix}-${sequenceNumber}` : String(sequenceNumber);

  logger.debug(`[PatientIdGenerator] Generated ID`, {
    clinicId,
    prefix,
    sequenceNumber,
    patientId,
  });

  return {
    patientId,
    prefix,
    sequenceNumber,
  };
}

/**
 * Resync the patient counter to the highest existing patient number.
 * This is called when there are conflicts to recover from out-of-sync counters.
 */
async function resyncPatientCounter(clinicId: number): Promise<void> {
  try {
    // Find the highest patient number for this clinic
    const highestPatient = await prisma.patient.findFirst({
      where: {
        clinicId,
        patientId: { not: null },
      },
      orderBy: { id: 'desc' },
      select: { patientId: true },
      take: 100, // Check last 100 patients for highest ID
    });

    if (!highestPatient?.patientId) {
      return;
    }

    // Extract the numeric part from the patient ID
    // Handles formats like "EON-123" or just "123"
    const match = highestPatient.patientId.match(/(\d+)$/);
    if (!match) {
      return;
    }

    const highestNum = parseInt(match[1], 10);
    if (isNaN(highestNum)) {
      return;
    }

    // Update the counter to be at least the highest number + 1
    await prisma.patientCounter.update({
      where: { clinicId },
      data: { current: highestNum + 1 },
    });

    logger.info(`[PatientIdGenerator] Resynced counter for clinic ${clinicId} to ${highestNum + 1}`);
  } catch (error) {
    logger.error(`[PatientIdGenerator] Failed to resync counter`, {
      clinicId,
      error: (error as Error).message,
    });
  }
}

/**
 * Generate a fallback patient ID using timestamp.
 * Used when all retries are exhausted.
 */
async function generateFallbackId(clinicId: number): Promise<string> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { patientIdPrefix: true, subdomain: true },
  });

  const prefix = clinic?.patientIdPrefix ?? clinic?.subdomain?.toUpperCase().slice(0, 3) ?? 'PAT';
  const timestamp = Date.now().toString().slice(-8);

  const fallbackId = `${prefix}-T${timestamp}`;

  logger.warn(`[PatientIdGenerator] Using fallback ID: ${fallbackId}`, { clinicId });

  return fallbackId;
}

/**
 * Get the next patient ID without incrementing the counter.
 * Useful for previewing what the next ID will be.
 *
 * @param clinicId - The clinic ID
 * @returns Preview of the next patient ID
 */
export async function previewNextPatientId(clinicId: number): Promise<string> {
  const [clinic, counter] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { patientIdPrefix: true },
    }),
    prisma.patientCounter.findUnique({
      where: { clinicId },
    }),
  ]);

  const prefix = clinic?.patientIdPrefix ?? null;
  const nextNumber = (counter?.current ?? 0) + 1;

  return prefix ? `${prefix}-${nextNumber}` : String(nextNumber);
}

/**
 * Validate a patient ID format.
 *
 * @param patientId - The patient ID to validate
 * @returns True if the ID matches expected format
 */
export function isValidPatientIdFormat(patientId: string): boolean {
  // Accepts formats:
  // - "EON-123" (prefix with number)
  // - "123" (number only)
  // - "EON-T12345678" (fallback format)
  return /^([A-Z]{2,5}-)?(\d+|T\d{8})$/.test(patientId);
}

/**
 * Parse a patient ID into its components.
 *
 * @param patientId - The patient ID to parse
 * @returns Object with prefix and number, or null if invalid
 */
export function parsePatientId(patientId: string): { prefix: string | null; number: string } | null {
  const match = patientId.match(/^(?:([A-Z]{2,5})-)?(.+)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1] ?? null,
    number: match[2],
  };
}
