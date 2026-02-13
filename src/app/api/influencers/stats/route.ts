import { NextRequest, NextResponse } from 'next/server';
import { getInfluencerStats } from '@/services/influencerService';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

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

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const influencer = await verifyInfluencerToken(req);
    if (!influencer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get influencer statistics
    const stats = await getInfluencerStats(influencer.id);

    return NextResponse.json({
      success: true,
      influencer: {
        id: influencer.id,
        name: influencer.name,
        email: influencer.email,
        promoCode: influencer.promoCode,
      },
      stats: {
        totalReferrals: stats.totalReferrals || 0,
        convertedReferrals: stats.convertedReferrals || 0,
        conversionRate: stats.conversionRate || 0,
        pendingEarnings: (stats.pendingCommissions?.amount || 0) / 100,
        paidEarnings: (stats.paidCommissions?.amount || 0) / 100,
        totalEarnings: (stats.totalEarnings || 0) / 100,
        recentReferrals: (stats.recentReferrals || []).map((ref: any) => ({
          id: ref.id,
          patient: {
            firstName: ref.patient?.firstName || 'Unknown',
            lastName: ref.patient?.lastName || 'Patient',
          },
          createdAt: ref.createdAt,
          isConverted: ref.isConverted,
          convertedAt: ref.convertedAt,
          referralExpiresAt: ref.referralExpiresAt,
        })),
        recentCommissions: (stats.recentCommissions || []).map((comm: any) => ({
          id: comm.id,
          invoiceId: comm.invoiceId,
          amount: (comm.commissionAmount || 0) / 100,
          status: comm.status,
          createdAt: comm.createdAt,
        })),
      },
    });
  } catch (error: any) {
    // @ts-ignore

    logger.error('[Influencer Stats] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
  }
}
