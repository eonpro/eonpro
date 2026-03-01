/**
 * Patient Registration API
 * ========================
 * Handles patient self-registration
 *
 * POST /api/auth/register
 * Body: { email, password, firstName, lastName, phone, dob, clinicCode }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { strictRateLimit } from '@/lib/rateLimit';
import {
  registerPatient,
  registerWithInviteToken,
  resendVerificationEmail,
} from '@/lib/auth/registration';

const PASSWORD_MIN_LENGTH = 12;
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const phoneSchema = z
  .string()
  .min(10, 'Phone number must be at least 10 digits')
  .regex(/^\+?[\d\s\-().]+$/, 'Phone number contains invalid characters');

// Schema for patient registration (with clinic code)
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: phoneSchema,
  dob: z.string().min(1, 'Date of birth is required'),
  clinicCode: z.string().min(1, 'Clinic code is required'),
});

// Schema for registration via one-time portal invite link (no clinic code)
const registerWithInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: phoneSchema,
  dob: z.string().min(1, 'Date of birth is required'),
  inviteToken: z.string().min(32, 'Invalid invite link'),
});

// Schema for resending verification email
const resendSchema = z.object({
  email: z.string().email('Invalid email address'),
  action: z.literal('resend'),
});

function formatZodErrors(issues: z.ZodIssue[]): string {
  const messages = issues.map((issue) => {
    if (issue.path.length > 0) {
      const field = issue.path[issue.path.length - 1];
      const fieldLabel =
        typeof field === 'string'
          ? field
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (s) => s.toUpperCase())
              .trim()
          : String(field);
      return `${fieldLabel}: ${issue.message}`;
    }
    return issue.message;
  });
  return messages.join('. ');
}

async function handler(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();

    // Check if this is a resend request
    if (body.action === 'resend') {
      const validated = resendSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: formatZodErrors(validated.error.issues), details: validated.error.issues },
          { status: 400 }
        );
      }

      const result = await resendVerificationEmail(validated.data.email);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    // Registration via one-time invite link (patient-specific)
    if (body.inviteToken) {
      const validated = registerWithInviteSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: formatZodErrors(validated.error.issues), details: validated.error.issues },
          { status: 400 }
        );
      }
      const ipAddress =
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      const result = await registerWithInviteToken(validated.data, ipAddress);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      logger.info('Patient registration (invite) successful', {
        userId: result.userId,
        patientId: result.patientId,
      });
      return NextResponse.json({ success: true, message: result.message });
    }

    // Regular registration with clinic code
    const validated = registerSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: formatZodErrors(validated.error.issues), details: validated.error.issues },
        { status: 400 }
      );
    }

    // Get IP address for audit logging
    const ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const result = await registerPatient(validated.data, ipAddress);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    logger.info('Patient registration successful', {
      userId: result.userId,
      patientId: result.patientId,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    logger.error('Registration endpoint error', { error: error.message });
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 });
  }
}

// Apply rate limiting (5 requests per minute per IP)
export const POST = strictRateLimit(handler);
