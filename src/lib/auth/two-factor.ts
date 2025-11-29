/**
 * Two-Factor Authentication (2FA) Implementation
 * HIPAA-compliant 2FA for admin and provider accounts
 */

import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// 2FA Configuration
const TWO_FACTOR_CONFIG = {
  issuer: 'EONPRO Health',
  digits: 6,
  step: 30, // 30 seconds
  window: 2, // Allow 2 time windows for clock drift
  backupCodesCount: 10,
  backupCodeLength: 8
};

interface TwoFactorSetupResult {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

interface TwoFactorVerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Generate a new 2FA secret and QR code for user setup
 */
export async function generateTwoFactorSecret(
  userId: number,
  email: string
): Promise<TwoFactorSetupResult> {
  try {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${TWO_FACTOR_CONFIG.issuer} (${email})`,
      issuer: TWO_FACTOR_CONFIG.issuer,
      length: 32
    });

    // Generate QR code
    const qrCode = await qrcode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Store encrypted secret and hashed backup codes in database
    await storeTwoFactorSecret(userId, secret.base32, backupCodes);

    logger.security('2FA secret generated', { userId, email });

    return {
      secret: secret.base32,
      qrCode,
      backupCodes
    };
  } catch (error) {
    logger.error('Failed to generate 2FA secret', error as Error, { userId });
    throw new Error('Failed to generate 2FA secret');
  }
}

/**
 * Enable 2FA for a user after successful verification
 */
export async function enableTwoFactor(
  userId: number,
  token: string
): Promise<boolean> {
  try {
    // Get stored secret
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true }
    });

    if (!user || !user.twoFactorSecret) {
      throw new Error('2FA secret not found');
    }

    if (user.twoFactorEnabled) {
      throw new Error('2FA already enabled');
    }

    // Verify the token
    const decryptedSecret = decryptSecret(user.twoFactorSecret);
    const verified = verifyToken(decryptedSecret, token);

    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorVerifiedAt: new Date()
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TWO_FACTOR_ENABLED',
        details: { timestamp: new Date().toISOString() }
      }
    });

    logger.security('2FA enabled', { userId });
    return true;
  } catch (error) {
    logger.error('Failed to enable 2FA', error as Error, { userId });
    return false;
  }
}

/**
 * Verify a 2FA token
 */
export async function verifyTwoFactorToken(
  userId: number,
  token: string
): Promise<TwoFactorVerifyResult> {
  try {
    // Get user's 2FA secret
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        twoFactorSecret: true, 
        twoFactorEnabled: true,
        twoFactorBackupCodes: true 
      }
    });

    if (!user || !user.twoFactorEnabled) {
      return { success: false, error: '2FA not enabled' };
    }

    // Try to verify with TOTP token
    const decryptedSecret = decryptSecret(user.twoFactorSecret!);
    const tokenValid = verifyToken(decryptedSecret, token);

    if (tokenValid) {
      await logSuccessfulVerification(userId);
      return { success: true };
    }

    // Try backup codes if TOTP fails
    if (user.twoFactorBackupCodes) {
      const backupCodes = user.twoFactorBackupCodes as string[];
      const backupCodeValid = await verifyBackupCode(userId, token, backupCodes);
      if (backupCodeValid) {
        return { success: true };
      }
    }

    await logFailedVerification(userId);
    return { success: false, error: 'Invalid code' };
  } catch (error) {
    logger.error('2FA verification error', error as Error, { userId });
    return { success: false, error: 'Verification failed' };
  }
}

/**
 * Disable 2FA for a user (requires admin privileges)
 */
export async function disableTwoFactor(
  userId: number,
  adminId: number,
  reason: string
): Promise<boolean> {
  try {
    // Verify admin has permission
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { role: true }
    });

    if (!admin || admin.role !== 'admin') {
      throw new Error('Unauthorized');
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        twoFactorVerifiedAt: null
      }
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'TWO_FACTOR_DISABLED',
        details: { 
          adminId,
          reason,
          timestamp: new Date().toISOString()
        }
      }
    });

    logger.security('2FA disabled', { userId, adminId, reason });
    return true;
  } catch (error) {
    logger.error('Failed to disable 2FA', error as Error, { userId });
    return false;
  }
}

/**
 * Generate new backup codes
 */
export async function regenerateBackupCodes(userId: number): Promise<string[]> {
  try {
    const backupCodes = generateBackupCodes();
    const hashedCodes = backupCodes.map(code => hashBackupCode(code));

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorBackupCodes: hashedCodes as any // Store as JSON
      }
    });

    logger.security('Backup codes regenerated', { userId });
    return backupCodes;
  } catch (error) {
    logger.error('Failed to regenerate backup codes', error as Error);
    throw error;
  }
}

// Helper functions

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < TWO_FACTOR_CONFIG.backupCodesCount; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function verifyBackupCode(
  userId: number, 
  code: string, 
  storedCodes: string[]
): Promise<boolean> {
  const hashedCode = hashBackupCode(code.toUpperCase());
  const index = storedCodes.indexOf(hashedCode);
  
  if (index === -1) {
    return false;
  }

  // Remove used backup code
  const updatedCodes = [...storedCodes];
  updatedCodes.splice(index, 1);
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorBackupCodes: updatedCodes as any // Store as JSON
    }
  });

  logger.security('Backup code used', { userId });
  return true;
}

function encryptSecret(secret: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptSecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

function verifyToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    digits: TWO_FACTOR_CONFIG.digits,
    step: TWO_FACTOR_CONFIG.step,
    window: TWO_FACTOR_CONFIG.window
  });
}

async function storeTwoFactorSecret(
  userId: number,
  secret: string,
  backupCodes: string[]
): Promise<void> {
  const encryptedSecret = encryptSecret(secret);
  const hashedBackupCodes = backupCodes.map(code => hashBackupCode(code));

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: hashedBackupCodes as any // Store as JSON
    }
  });
}

async function logSuccessfulVerification(userId: number): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'TWO_FACTOR_VERIFICATION_SUCCESS',
      details: { timestamp: new Date().toISOString() }
    }
  });
}

async function logFailedVerification(userId: number): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'TWO_FACTOR_VERIFICATION_FAILED',
      details: { timestamp: new Date().toISOString() }
    }
  });
}

/**
 * Check if 2FA is required for a user based on role
 */
export function isTwoFactorRequired(role: string): boolean {
  const requiredRoles = ['admin', 'provider'];
  return requiredRoles.includes(role.toLowerCase());
}
