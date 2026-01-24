/**
 * Validate Clinic Code API
 * =========================
 * Validates a clinic invite code for patient self-registration
 * 
 * POST /api/auth/validate-clinic-code
 * Body: { code: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { strictRateLimit } from '@/lib/rateLimit';

// Schema for clinic code validation
const validateCodeSchema = z.object({
  code: z.string().min(1, 'Clinic code is required').max(50),
});

async function handler(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const validated = validateCodeSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.issues },
        { status: 400 }
      );
    }
    
    const { code } = validated.data;
    
    // Normalize code to uppercase for case-insensitive matching
    const normalizedCode = code.trim().toUpperCase();
    
    // Find the invite code
    const inviteCode = await prisma.clinicInviteCode.findUnique({
      where: { code: normalizedCode },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            status: true,
          },
        },
      },
    });
    
    // Check if code exists
    if (!inviteCode) {
      logger.warn('Invalid clinic code attempted', { code: normalizedCode });
      return NextResponse.json(
        { error: 'Invalid clinic code. Please check the code and try again.' },
        { status: 404 }
      );
    }
    
    // Check if code is active
    if (!inviteCode.isActive) {
      return NextResponse.json(
        { error: 'This clinic code is no longer active. Please contact the clinic for a new code.' },
        { status: 400 }
      );
    }
    
    // Check if code has expired
    if (inviteCode.expiresAt && new Date() > inviteCode.expiresAt) {
      return NextResponse.json(
        { error: 'This clinic code has expired. Please contact the clinic for a new code.' },
        { status: 400 }
      );
    }
    
    // Check if usage limit reached
    if (inviteCode.usageLimit !== null && inviteCode.usageCount >= inviteCode.usageLimit) {
      return NextResponse.json(
        { error: 'This clinic code has reached its usage limit. Please contact the clinic for a new code.' },
        { status: 400 }
      );
    }
    
    // Check if clinic is active
    if (inviteCode.clinic.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'This clinic is not currently accepting new registrations.' },
        { status: 400 }
      );
    }
    
    logger.info('Clinic code validated successfully', { 
      code: normalizedCode, 
      clinicId: inviteCode.clinicId 
    });
    
    // Return clinic info (limited for security)
    return NextResponse.json({
      success: true,
      clinic: {
        id: inviteCode.clinic.id,
        name: inviteCode.clinic.name,
        logoUrl: inviteCode.clinic.logoUrl,
      },
      code: normalizedCode,
    });
    
  } catch (error: any) {
    logger.error('Error validating clinic code', { error: error.message });
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// Apply rate limiting (10 requests per minute per IP)
export const POST = strictRateLimit(handler);
