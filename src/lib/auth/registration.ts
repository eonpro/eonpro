/**
 * Patient Registration Service
 * ============================
 * Handles patient self-registration with email verification
 * HIPAA-compliant with secure token handling
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail, EmailTemplate } from '@/lib/email';
import { buildPatientSearchIndex } from '@/lib/utils/search';

// Configuration
const VERIFICATION_TOKEN_LENGTH = 32;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24; // 24 hour expiry
const BCRYPT_ROUNDS = 12;

const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

/** Base URL for emails (server-side env so production domain is correct at runtime). */
function getAppBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).replace(/\/$/, '');
}

export interface RegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string; // YYYY-MM-DD format
  clinicCode: string;
}

/** Registration via one-time portal invite link (no clinic code). */
export interface RegisterWithInviteInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  inviteToken: string;
}

export interface RegistrationResult {
  success: boolean;
  message?: string;
  error?: string;
  userId?: number;
  patientId?: number;
}

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(VERIFICATION_TOKEN_LENGTH).toString('hex');
}

/**
 * Validate password against requirements
 */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate phone number format
 */
export function validatePhone(phone: string): boolean {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  // Must be 10 digits (US) or 11 digits starting with 1
  return digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith('1'));
}

/**
 * Format phone number to standard format
 */
export function formatPhone(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }
  return phone;
}

/**
 * Validate date of birth format and reasonableness
 */
export function validateDOB(dob: string): { isValid: boolean; error?: string } {
  // Support multiple formats: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY
  const isoFormat = /^\d{4}-\d{2}-\d{2}$/;
  const usFormat = /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/;

  let date: Date;

  if (isoFormat.test(dob)) {
    date = new Date(dob);
  } else if (usFormat.test(dob)) {
    const parts = dob.split(/[\/\-]/);
    date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
  } else {
    return { isValid: false, error: 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY' };
  }

  if (isNaN(date.getTime())) {
    return { isValid: false, error: 'Invalid date' };
  }

  const now = new Date();
  const minAge = 13; // Minimum age requirement
  const maxAge = 120;

  const age = Math.floor((now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  if (age < minAge) {
    return { isValid: false, error: `You must be at least ${minAge} years old to register` };
  }

  if (age > maxAge) {
    return { isValid: false, error: 'Invalid date of birth' };
  }

  return { isValid: true };
}

/**
 * Normalize DOB to ISO format (YYYY-MM-DD)
 */
export function normalizeDOB(dob: string): string {
  const usFormat = /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/;

  if (usFormat.test(dob)) {
    const parts = dob.split(/[\/\-]/);
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  return dob;
}

/**
 * Register a new patient
 */
export async function registerPatient(
  input: RegistrationInput,
  ipAddress?: string
): Promise<RegistrationResult> {
  const { email, password, firstName, lastName, phone, dob, clinicCode } = input;

  try {
    // Normalize inputs
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = clinicCode.trim().toUpperCase();
    const normalizedPhone = formatPhone(phone);
    const normalizedDOB = normalizeDOB(dob);

    // Validate clinic code
    const inviteCode = await prisma.clinicInviteCode.findUnique({
      where: { code: normalizedCode },
      include: { clinic: true },
    });

    if (!inviteCode || !inviteCode.isActive) {
      return { success: false, error: 'Invalid or inactive clinic code' };
    }

    if (inviteCode.expiresAt && new Date() > inviteCode.expiresAt) {
      return { success: false, error: 'Clinic code has expired' };
    }

    if (inviteCode.usageLimit !== null && inviteCode.usageCount >= inviteCode.usageLimit) {
      return { success: false, error: 'Clinic code has reached its usage limit' };
    }

    if (inviteCode.clinic.status !== 'ACTIVE') {
      return { success: false, error: 'Clinic is not accepting new registrations' };
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Don't reveal that email exists (security)
      logger.warn('Registration attempted with existing email', { email: normalizedEmail });
      return {
        success: false,
        error: 'Unable to complete registration. Please try again or contact support.',
      };
    }

    // Check if patient with same email exists in this clinic
    const existingPatient = await prisma.patient.findFirst({
      where: {
        email: normalizedEmail,
        clinicId: inviteCode.clinicId,
      },
      include: {
        user: true, // Check if patient already has a linked User account
      },
    });

    // If patient exists and already has a User account, they should login instead
    if (existingPatient?.user) {
      logger.warn('Registration attempted with existing patient+user email', {
        email: normalizedEmail,
        clinicId: inviteCode.clinicId,
        patientId: existingPatient.id,
      });
      return {
        success: false,
        error: 'An account with this email already exists. Please login or reset your password.',
      };
    }

    // If patient exists without a User account (from intake), we'll link to it
    // First verify identity by matching core fields (name and DOB)
    let linkToExistingPatient = false;
    if (existingPatient && !existingPatient.user) {
      // Normalize names for comparison (case-insensitive, trimmed)
      const existingFirstName = existingPatient.firstName?.toLowerCase().trim() || '';
      const existingLastName = existingPatient.lastName?.toLowerCase().trim() || '';
      const inputFirstName = firstName.toLowerCase().trim();
      const inputLastName = lastName.toLowerCase().trim();

      // Normalize DOB for comparison
      const existingDOB = existingPatient.dob?.replace(/[\/\-]/g, '') || '';
      const inputDOBNormalized = normalizedDOB.replace(/[\/\-]/g, '');

      // Check if name and DOB match (identity verification)
      const nameMatches =
        existingFirstName === inputFirstName && existingLastName === inputLastName;
      const dobMatches = existingDOB === inputDOBNormalized;

      if (nameMatches && dobMatches) {
        // Identity verified - will link to existing patient
        linkToExistingPatient = true;
        logger.info('Patient portal registration will link to existing intake patient', {
          email: normalizedEmail,
          patientId: existingPatient.id,
          clinicId: inviteCode.clinicId,
        });
      } else {
        // Identity mismatch - could be someone trying to hijack account
        logger.warn('Patient portal registration identity mismatch with existing patient', {
          email: normalizedEmail,
          patientId: existingPatient.id,
          clinicId: inviteCode.clinicId,
          nameMatches,
          dobMatches,
        });
        return {
          success: false,
          error:
            'The information provided does not match our records. Please ensure your name and date of birth match the information from your intake form, or contact support for assistance.',
        };
      }
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return { success: false, error: passwordValidation.errors.join('. ') };
    }

    // Validate phone
    if (!validatePhone(phone)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Validate DOB
    const dobValidation = validateDOB(dob);
    if (!dobValidation.isValid) {
      return { success: false, error: dobValidation.error };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const hashedToken = hashToken(verificationToken);
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

    // Create user (and optionally patient) in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let patient;

      if (linkToExistingPatient && existingPatient) {
        // Link to existing patient from intake - update their phone if provided
        patient = await tx.patient.update({
          where: { id: existingPatient.id },
          data: {
            // Update phone if the existing one is empty or this one is different
            ...(normalizedPhone &&
            (!existingPatient.phone || existingPatient.phone !== normalizedPhone)
              ? { phone: normalizedPhone }
              : {}),
            // Mark that portal access was created
            sourceMetadata: {
              ...(typeof existingPatient.sourceMetadata === 'object'
                ? existingPatient.sourceMetadata
                : {}),
              portalAccessCreated: new Date().toISOString(),
              portalClinicCode: normalizedCode,
            },
          },
        });

        logger.info('Linked portal registration to existing intake patient', {
          patientId: patient.id,
          email: normalizedEmail,
          clinicId: inviteCode.clinicId,
        });
      } else {
        // Create new patient record (self-registration without prior intake)
        const searchIndex = buildPatientSearchIndex({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
        });
        patient = await tx.patient.create({
          data: {
            clinicId: inviteCode.clinicId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail,
            phone: normalizedPhone,
            dob: normalizedDOB,
            gender: 'other', // Will be updated in profile completion
            address1: '', // Will be updated in profile completion
            city: '',
            state: '',
            zip: '',
            source: 'self_registration',
            searchIndex,
            sourceMetadata: { clinicCode: normalizedCode, ipAddress },
          },
        });
      }

      // Create user record linked to patient
      const user = await tx.user.create({
        data: {
          clinicId: inviteCode.clinicId,
          email: normalizedEmail,
          passwordHash,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: 'PATIENT',
          status: 'ACTIVE',
          patientId: patient.id,
          emailVerified: false,
        },
      });

      // Create email verification token
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          expiresAt: tokenExpiresAt,
        },
      });

      // Increment clinic code usage count
      await tx.clinicInviteCode.update({
        where: { id: inviteCode.id },
        data: { usageCount: { increment: 1 } },
      });

      return { patient, user, linkedToExisting: linkToExistingPatient };
    });

    // Send welcome email with verification link
    const baseUrl = getAppBaseUrl();
    const verificationUrl = baseUrl
      ? `${baseUrl}/api/auth/verify-email?token=${verificationToken}`
      : '';

    try {
      await sendTemplatedEmail({
        to: normalizedEmail,
        template: EmailTemplate.PATIENT_WELCOME_VERIFICATION,
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          verificationLink: verificationUrl,
          expiresIn: '24 hours',
          clinicName: inviteCode.clinic.name,
        },
      });

      logger.info('Welcome email sent for new patient registration', {
        userId: result.user.id,
        patientId: result.patient.id,
        email: normalizedEmail,
      });
    } catch (emailError: any) {
      // Log error but don't fail registration
      logger.error('Failed to send welcome email', {
        userId: result.user.id,
        error: emailError.message,
      });
    }

    // Audit log
    logger.security('Patient portal registration', {
      userId: result.user.id,
      patientId: result.patient.id,
      clinicId: inviteCode.clinicId,
      email: normalizedEmail,
      ipAddress,
      linkedToExistingPatient: result.linkedToExisting,
    });

    return {
      success: true,
      message: result.linkedToExisting
        ? 'Account created and linked to your existing patient profile. Please check your email to verify your account.'
        : 'Registration successful. Please check your email to verify your account.',
      userId: result.user.id,
      patientId: result.patient.id,
    };
  } catch (error: any) {
    logger.error('Patient registration failed', { error: error.message });
    return {
      success: false,
      error: 'Registration failed. Please try again.',
    };
  }
}

/**
 * Register using a one-time portal invite token (patient-specific link).
 * Creates User linked to the invite's patient; no clinic code or name/DOB matching required.
 */
export async function registerWithInviteToken(
  input: RegisterWithInviteInput,
  ipAddress?: string
): Promise<RegistrationResult> {
  const { validateInviteToken, markInviteTokenUsed } = await import('@/lib/portal-invite/service');
  const { email, password, firstName, lastName, phone, dob, inviteToken } = input;

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = formatPhone(phone);
    const normalizedDOB = normalizeDOB(dob);

    const invite = await validateInviteToken(inviteToken);
    if (!invite) {
      return {
        success: false,
        error:
          'This invite link is invalid or has expired. Please request a new one from your care team.',
      };
    }

    if (normalizedEmail !== invite.patient.email.toLowerCase().trim()) {
      return {
        success: false,
        error: 'Email must match the email we have on file for this invite.',
      };
    }

    const inviteDob = (invite.patient.dob || '').trim();
    if (inviteDob) {
      const inviteDobNormalized = normalizeDOB(inviteDob);
      if (normalizedDOB !== inviteDobNormalized) {
        return {
          success: false,
          error: 'Date of birth must match the date we have on file for this invite.',
        };
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      logger.warn('RegisterWithInvite attempted with existing email', { email: normalizedEmail });
      return {
        success: false,
        error: 'An account with this email already exists. Please log in or reset your password.',
      };
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return { success: false, error: passwordValidation.errors.join('. ') };
    }
    if (!validatePhone(phone)) {
      return { success: false, error: 'Invalid phone number format' };
    }
    const dobValidation = validateDOB(dob);
    if (!dobValidation.isValid) {
      return { success: false, error: dobValidation.error };
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = generateVerificationToken();
    const hashedToken = hashToken(verificationToken);
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

    const clinic = await prisma.clinic.findUnique({
      where: { id: invite.clinicId },
      select: { name: true },
    });

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          clinicId: invite.clinicId,
          email: normalizedEmail,
          passwordHash,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: 'PATIENT',
          status: 'ACTIVE',
          patientId: invite.patientId,
          emailVerified: false,
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          expiresAt: tokenExpiresAt,
        },
      });
      return { user };
    });

    await markInviteTokenUsed(inviteToken);

    const baseUrl = getAppBaseUrl();
    const verificationUrl = baseUrl
      ? `${baseUrl}/api/auth/verify-email?token=${verificationToken}`
      : '';
    try {
      await sendTemplatedEmail({
        to: normalizedEmail,
        template: EmailTemplate.PATIENT_WELCOME_VERIFICATION,
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          verificationLink: verificationUrl,
          expiresIn: '24 hours',
          clinicName: clinic?.name || 'Your Clinic',
        },
      });
    } catch (emailError: any) {
      logger.error('Failed to send welcome email after invite registration', {
        userId: result.user.id,
        error: emailError.message,
      });
    }

    logger.security('Patient portal registration (invite token)', {
      userId: result.user.id,
      patientId: invite.patientId,
      clinicId: invite.clinicId,
      ipAddress,
    });

    return {
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      userId: result.user.id,
      patientId: invite.patientId,
    };
  } catch (error: any) {
    logger.error('Register with invite failed', { error: error.message });
    return { success: false, error: 'Registration failed. Please try again.' };
  }
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<RegistrationResult> {
  try {
    const hashedToken = hashToken(token);

    // Find the verification token
    const verificationRecord = await prisma.emailVerificationToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!verificationRecord) {
      return { success: false, error: 'Invalid verification link' };
    }

    // Link already used = user may already be verified (e.g. double-click or refresh). Treat as success so they can log in.
    if (verificationRecord.used) {
      if (verificationRecord.user.emailVerified) {
        return {
          success: true,
          message: 'Your email is already verified. You can log in.',
          userId: verificationRecord.userId,
        };
      }
      return { success: false, error: 'This verification link has already been used' };
    }

    if (new Date() > verificationRecord.expiresAt) {
      return {
        success: false,
        error: 'This verification link has expired. Please request a new one.',
      };
    }

    // Mark user as verified and token as used (use callback form for Prisma wrapper compatibility)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: verificationRecord.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      await tx.emailVerificationToken.update({
        where: { id: verificationRecord.id },
        data: {
          used: true,
          usedAt: new Date(),
        },
      });
    });

    logger.security('Email verified', {
      userId: verificationRecord.userId,
      email: verificationRecord.user.email,
    });

    return {
      success: true,
      message: 'Email verified successfully. You can now log in.',
      userId: verificationRecord.userId,
    };
  } catch (error: any) {
    logger.error('Email verification failed', { error: error.message });
    return { success: false, error: 'Verification failed. Please try again.' };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(email: string): Promise<RegistrationResult> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { clinic: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account exists, a verification email has been sent.',
      };
    }

    if (user.emailVerified) {
      return { success: false, error: 'Email is already verified. Please log in.' };
    }

    // Invalidate existing tokens
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate new token
    const verificationToken = generateVerificationToken();
    const hashedToken = hashToken(verificationToken);
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: tokenExpiresAt,
      },
    });

    // Send verification email
    const baseUrl = getAppBaseUrl();
    const verificationUrl = baseUrl
      ? `${baseUrl}/api/auth/verify-email?token=${verificationToken}`
      : '';

    await sendTemplatedEmail({
      to: normalizedEmail,
      template: EmailTemplate.PATIENT_WELCOME_VERIFICATION,
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        verificationLink: verificationUrl,
        expiresIn: '24 hours',
        clinicName: user.clinic?.name || 'Your Healthcare Provider',
      },
    });

    logger.info('Verification email resent', { userId: user.id, email: normalizedEmail });

    return { success: true, message: 'Verification email sent. Please check your inbox.' };
  } catch (error: any) {
    logger.error('Failed to resend verification email', { error: error.message, email });
    return { success: false, error: 'Failed to send email. Please try again.' };
  }
}
