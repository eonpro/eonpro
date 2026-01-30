import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CommissionStatus, InfluencerStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { logger } from '@/lib/logger';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';

export const GET = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const influencers = await prisma.influencer.findMany({
      include: {
        referrals: true,
        commissions: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const influencersWithStats = await Promise.all(
      influencers.map(async (influencer: any) => {
        const pendingCommissions = await prisma.commission.aggregate({
          where: { 
            influencerId: influencer.id, 
            status: CommissionStatus.PENDING
          },
          _sum: { commissionAmount: true }
        });

        const paidCommissions = await prisma.commission.aggregate({
          where: { 
            influencerId: influencer.id, 
            status: CommissionStatus.PAID
          },
          _sum: { commissionAmount: true }
        });

        const convertedReferrals = influencer.referrals.filter(
          (r: any) => r.isConverted === true
        ).length;

        return {
          id: influencer.id,
          name: influencer.name,
          email: influencer.email,
          promoCode: influencer.promoCode,
          commissionRate: influencer.commissionRate,
          status: influencer.status,
          totalReferrals: influencer.referrals.length,
          convertedReferrals,
          pendingEarnings: (pendingCommissions._sum.commissionAmount || 0) / 100, // Convert cents to dollars
          totalEarnings: (paidCommissions._sum.commissionAmount || 0) / 100, // Convert cents to dollars
          lastLogin: influencer.lastLogin,
        };
      })
    );

    return NextResponse.json(influencersWithStats);
  } catch (error: any) {
    logger.error("[Admin Influencers API] Error fetching influencers:", error);
    return NextResponse.json(
      { error: "Failed to fetch influencers" },
      { status: 500 }
    );
  }
});

export const POST = withAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { name, email, promoCode, password, commissionRate, status } = await req.json();

    // Validate required fields
    if (!name || !email || !promoCode || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if email or promo code already exists
    const existingInfluencer: any = await prisma.influencer.findFirst({
      where: {
        OR: [
          { email },
          { promoCode: promoCode.toUpperCase() }
        ]
      }
    });

    if (existingInfluencer) {
      if (existingInfluencer.email === email) {
        return NextResponse.json(
          { error: "An influencer with this email already exists" },
          { status: 400 }
        );
      }
      if (existingInfluencer.promoCode === promoCode.toUpperCase()) {
        return NextResponse.json(
          { error: "This promo code is already taken" },
          { status: 400 }
        );
      }
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create the influencer
    const influencer = await prisma.influencer.create({
      data: {
        name,
        email,
        promoCode: promoCode.toUpperCase(),
        passwordHash,
        commissionRate: commissionRate || 0.10,
        status: status || InfluencerStatus.ACTIVE,
      }
    });

    return NextResponse.json({
      success: true,
      influencer: {
        id: influencer.id,
        name: influencer.name,
        email: influencer.email,
        promoCode: influencer.promoCode,
        commissionRate: influencer.commissionRate,
        status: influencer.status
      }
    });
  } catch (error: any) {
    logger.error("[Admin Influencers API] Error creating influencer:", error);
    return NextResponse.json(
      { error: "Failed to create influencer" },
      { status: 500 }
    );
  }
});