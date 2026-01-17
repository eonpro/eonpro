import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data: any) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

/**
 * POST /api/providers/[id]/set-password
 * Set or update provider password
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const providerId = parseInt(resolvedParams.id, 10);
    const body = await request.json();
    
    // Validate input
    const validated = setPasswordSchema.parse(body);
    
    // Check if provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId }
    });
    
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }
    
    // Hash the password
    const passwordHash = await bcrypt.hash(validated.password, 12);
    
    // Update provider with password
    const updatedProvider = await prisma.provider.update({ where: { id: provider.id }, data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      } as any });
    
    logger.debug(`[Provider] Password set for provider ${providerId}`);
    
    return NextResponse.json({
      ok: true,
      message: 'Password set successfully',
      provider: {
        id: updatedProvider.id,
        firstName: updatedProvider.firstName,
        lastName: updatedProvider.lastName,
        email: updatedProvider.email,
      }
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // @ts-ignore
   
    logger.error('[Provider] Error setting password:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to set password' },
      { status: 500 }
    );
  }
}
