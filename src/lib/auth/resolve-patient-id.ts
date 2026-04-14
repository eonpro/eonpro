/**
 * Resolve Patient ID for Authenticated Users
 *
 * When a patient's User record lacks `patientId` (e.g. created outside the
 * invite flow, or the login fallback failed before the searchIndex fix),
 * this utility resolves it via:
 *   1. Re-checking User.patientId in DB (may have been set since the JWT was issued)
 *   2. searchIndex lookup + decryptPHI email verification
 *
 * When a match is found, the link is persisted to User.patientId so future
 * requests (and the provider-side "Portal access" block) work immediately.
 *
 * @module lib/auth/resolve-patient-id
 */

import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

interface MinimalUser {
  id: number;
  email: string;
  clinicId?: number;
}

/**
 * Attempt to resolve patientId for a user whose JWT lacks it.
 * Returns the resolved patientId or null if no match is found.
 */
export async function resolvePatientId(user: MinimalUser): Promise<number | null> {
  try {
    // 1) Re-check User record — patientId may have been set since the token was issued
    const dbUser = await basePrisma.user.findUnique({
      where: { id: user.id },
      select: { patientId: true },
    });
    if (dbUser?.patientId) return dbUser.patientId;

    // 2) searchIndex-based lookup: find Patient candidates whose searchIndex contains the email
    const emailLower = user.email.toLowerCase();
    const candidates = await basePrisma.patient.findMany({
      where: {
        ...(user.clinicId ? { clinicId: user.clinicId } : {}),
        searchIndex: { contains: emailLower, mode: 'insensitive' },
      },
      select: { id: true, email: true },
      take: 10,
    });

    for (const candidate of candidates) {
      try {
        const decryptedEmail = decryptPHI(candidate.email);
        if (decryptedEmail && decryptedEmail.toLowerCase() === emailLower) {
          persistPatientLink(user.id, candidate.id);
          logger.info('[ResolvePatientId] Linked User to Patient via searchIndex', {
            userId: user.id,
            patientId: candidate.id,
          });
          return candidate.id;
        }
      } catch {
        // If decryption fails, try plain-text comparison (legacy non-encrypted records)
        if (candidate.email.toLowerCase() === emailLower) {
          persistPatientLink(user.id, candidate.id);
          return candidate.id;
        }
      }
    }

    return null;
  } catch (err: unknown) {
    logger.error('[ResolvePatientId] Failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Non-blocking update to persist User.patientId. */
function persistPatientLink(userId: number, patientId: number): void {
  basePrisma.user
    .update({
      where: { id: userId },
      data: { patientId },
    })
    .catch((err: unknown) => {
      logger.warn('[ResolvePatientId] Failed to persist User.patientId', {
        userId,
        patientId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
