import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { InfluencerStatus, CommissionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { logger } from '@/lib/logger';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const influencerId = parseInt(params.id);
    const updates = await req.json();

    // Check if influencer exists
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId }
    });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.email) updateData.email = updates.email;
    if (updates.promoCode) updateData.promoCode = updates.promoCode.toUpperCase();
    if (updates.commissionRate !== undefined) {
      updateData.commissionRate = updates.commissionRate;
    }
    if (updates.status) updateData.status = updates.status;
    if (updates.phone !== undefined) updateData.phone = updates.phone || null;
    if (updates.paypalEmail !== undefined) updateData.paypalEmail = updates.paypalEmail || null;
    if (updates.preferredPaymentMethod !== undefined) updateData.preferredPaymentMethod = updates.preferredPaymentMethod || null;
    if (updates.notes !== undefined) updateData.notes = updates.notes || null;
    
    // If password is provided, hash it
    if (updates.password && updates.password.length >= 12) {
      updateData.passwordHash = await bcrypt.hash(updates.password, 12);
    }

    // Update the influencer
    const updatedInfluencer = await prisma.influencer.update({
      where: { id: influencerId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      influencer: {
        id: updatedInfluencer.id,
        name: updatedInfluencer.name,
        email: updatedInfluencer.email,
        promoCode: updatedInfluencer.promoCode,
        commissionRate: updatedInfluencer.commissionRate,
        status: updatedInfluencer.status
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("[Admin Influencer Update API] Error:", error);
    return NextResponse.json(
      { error: errorMessage || "Failed to update influencer" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const influencerId = parseInt(resolvedParams.id);
    const updates = await req.json();

    // Check if influencer exists
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId }
    });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};
    
    if (updates.name) updateData.name = updates.name;
    if (updates.commissionRate !== undefined) {
      updateData.commissionRate = updates.commissionRate;
    }
    if (updates.status) updateData.status = updates.status;
    
    // If password is provided, hash it
    if (updates.password) {
      updateData.passwordHash = await bcrypt.hash(updates.password, 12);
    }

    // Update the influencer
    const updatedInfluencer = await prisma.influencer.update({
      where: { id: influencerId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      influencer: {
        id: updatedInfluencer.id,
        name: updatedInfluencer.name,
        email: updatedInfluencer.email,
        promoCode: updatedInfluencer.promoCode,
        commissionRate: updatedInfluencer.commissionRate,
        status: updatedInfluencer.status
      }
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error("[Admin Influencer Update API] Error:", error);
    return NextResponse.json(
      { error: "Failed to update influencer" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const influencerId = parseInt(resolvedParams.id);

    // Check if influencer exists
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      include: {
        referrals: true,
        commissions: true
      }
    });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 }
      );
    }

    // Check if influencer has active referrals or pending commissions
    const hasActiveReferrals = influencer.referrals.some(
      (r: { isConverted: boolean; referralExpiresAt: Date }) => !r.isConverted && new Date(r.referralExpiresAt) > new Date()
    );
    const hasPendingCommissions = influencer.commissions.some(
      (c: { status: string }) => c.status === CommissionStatus.PENDING
    );

    if (hasActiveReferrals || hasPendingCommissions) {
      return NextResponse.json(
        { 
          error: "Cannot delete influencer with active referrals or pending commissions. Please resolve these first." 
        },
        { status: 400 }
      );
    }

    // Soft delete by setting status to INACTIVE instead of hard delete
    // This preserves historical data
    const deletedInfluencer = await prisma.influencer.update({
      where: { id: influencerId },
      data: { status: InfluencerStatus.INACTIVE }
    });

    return NextResponse.json({
      success: true,
      message: "Influencer deactivated successfully"
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error("[Admin Influencer Delete API] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete influencer" },
      { status: 500 }
    );
  }
}