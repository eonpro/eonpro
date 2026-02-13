import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jwtVerify } from 'jose';
import { z } from 'zod';

import { JWT_SECRET } from '@/lib/auth/config';
import { logger } from '@/lib/logger';

interface JWTPayload {
  id: number;
  email: string;
  name: string;
  promoCode: string;
}

async function verifyInfluencerToken(req: NextRequest): Promise<JWTPayload | null> {
  try {
    const token = req.cookies.get('influencer-token')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch (error: any) {
    // @ts-ignore

    return null;
  }
}

const paymentSettingsSchema = z.object({
  paypalEmail: z.string().email().optional().or(z.literal('')),
  preferredPaymentMethod: z.enum(['paypal', 'bank_transfer', 'check']).default('paypal'),
});

export async function GET(req: NextRequest) {
  try {
    const influencer = await verifyInfluencerToken(req);
    if (!influencer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const influencerData = await prisma.influencer.findUnique({
      where: { id: influencer.id },
      select: {
        paypalEmail: true,
        preferredPaymentMethod: true,
      },
    });

    if (!influencerData) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    return NextResponse.json({
      paypalEmail: influencerData.paypalEmail || undefined,
      preferredPaymentMethod: influencerData.preferredPaymentMethod || 'paypal',
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[Payment Settings API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const influencer = await verifyInfluencerToken(req);
    if (!influencer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = paymentSettingsSchema.parse(body);

    await prisma.influencer.update({
      where: { id: influencer.id },
      data: {
        paypalEmail: validatedData.paypalEmail || undefined,
        preferredPaymentMethod: validatedData.preferredPaymentMethod,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment settings updated successfully',
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[Payment Settings API] POST error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update payment settings' }, { status: 500 });
  }
}
