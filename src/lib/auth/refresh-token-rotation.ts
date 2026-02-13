/**
 * Refresh Token Rotation + Reuse Detection
 * Enterprise: HMAC-SHA256 storage with pepper, rotate on use, revoke on reuse.
 *
 * @module auth/refresh-token-rotation
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const PEPPER = process.env.REFRESH_TOKEN_PEPPER;
const HMAC_ALGO = 'sha256';
const HASH_ENCODING: BufferEncoding = 'hex';

/**
 * Hash a refresh token for storage (HMAC-SHA256 with pepper when set).
 * Fallback to SHA-256 when REFRESH_TOKEN_PEPPER is not configured (legacy).
 */
export function hashRefreshToken(token: string): string {
  if (PEPPER && PEPPER.length >= 16) {
    return crypto.createHmac(HMAC_ALGO, PEPPER).update(token).digest(HASH_ENCODING);
  }
  return crypto.createHash(HMAC_ALGO).update(token).digest(HASH_ENCODING);
}

/**
 * Find UserSession by refresh token hash.
 */
export async function findSessionByRefreshHash(hash: string) {
  return prisma.userSession.findUnique({
    where: { refreshTokenHash: hash },
    include: { user: true },
  });
}

/**
 * On refresh token reuse: revoke all sessions for user and log security event.
 */
export async function handleRefreshTokenReuse(userId: number): Promise<void> {
  logger.security('[Auth] Refresh token reuse detected - revoking all sessions', { userId });
  await prisma.userSession.deleteMany({ where: { userId } });
}

/**
 * Rotate refresh token: update session with new hash, invalidate old.
 */
export async function rotateSessionRefreshToken(
  sessionId: number,
  newRefreshToken: string
): Promise<void> {
  const newHash = hashRefreshToken(newRefreshToken);
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { refreshTokenHash: newHash, lastActivity: new Date() },
  });
}
