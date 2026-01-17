import { prisma } from '@/lib/db';
import { addDays } from 'date-fns';
import type { Patient, Influencer, ReferralTracking, Commission, Invoice } from '@prisma/client';
import { logger } from '@/lib/logger';

// Default referral tracking duration (90 days)
const REFERRAL_DURATION_DAYS = 90;

/**
 * Find or create an influencer by promo code
 */
export async function findOrCreateInfluencer(promoCode: string, influencerData?: {
  name?: string;
  email?: string;
}): Promise<Influencer | null> {
  if (!promoCode) return null;

  try {
    // First try to find existing influencer
    let influencer = await prisma.influencer.findUnique({
      where: { promoCode: promoCode.toUpperCase() }
    });

    // If not found and we have data, create a placeholder influencer
    if (!influencer && influencerData?.email) {
      influencer = await prisma.influencer.create({
        data: {
          promoCode: promoCode.toUpperCase(),
          name: influencerData.name || promoCode.toUpperCase(),
          email: influencerData.email,
          status: 'PENDING_APPROVAL',
          commissionRate: 0.10, // 10% default
        }
      });
    }

    return influencer;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Service] Error finding/creating influencer:', error);
    return null;
  }
}

/**
 * Track a new referral from an influencer
 */
export async function trackReferral(
  patientId: number,
  promoCode: string,
  referralSource?: string,
  metadata?: any
): Promise<ReferralTracking | null> {
  try {
    // Find the influencer by promo code
    const influencer = await findOrCreateInfluencer(promoCode);
    if (!influencer) {
      logger.warn(`[Influencer Service] No influencer found for promo code: ${promoCode}`);
      return null;
    }

    // Check if referral already exists for this patient
    const existingReferral = await prisma.referralTracking.findUnique({
      where: { patientId }
    });

    if (existingReferral) {
      logger.debug(`[Influencer Service] Referral already exists for patient ${patientId}`);
      return existingReferral;
    }

    // Create new referral tracking
    const referral = await prisma.referralTracking.create({
      data: {
        patientId,
        influencerId: influencer.id,
        promoCode: promoCode.toUpperCase(),
        referralSource,
        referralExpiresAt: addDays(new Date(), REFERRAL_DURATION_DAYS),
        metadata
      },
      include: {
        influencer: true,
        patient: true
      }
    });

    logger.debug(`[Influencer Service] Created referral tracking for patient ${patientId} with influencer ${influencer.name}`);
    
    // Add a tag to the patient for easy identification and update source if not set
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        tags: {
          push: `influencer:${promoCode.toUpperCase()}`
        },
        // Update source if it was manual (default) to referral
        source: "referral",
        sourceMetadata: {
          influencerId: influencer.id,
          influencerName: influencer.name,
          promoCode: promoCode.toUpperCase(),
          referralTrackingId: referral.id,
          timestamp: new Date().toISOString()
        }
      }
    });

    return referral;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Service] Error tracking referral:', error);
    return null;
  }
}

/**
 * Process commission when an invoice is paid
 */
export async function processCommission(invoiceId: number): Promise<Commission | null> {
  try {
    // Get invoice with patient
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: true }
    });

    if (!invoice || invoice.status !== 'PAID' || invoice.commissionGenerated) {
      return null;
    }

    // Check for active referral
    const referral: any = await prisma.referralTracking.findFirst({
      where: {
        patientId: invoice.patientId,
        referralExpiresAt: { gte: new Date() },
        isConverted: false
      },
      include: { influencer: true }
    });

    if (!referral) {
      logger.debug(`[Influencer Service] No active referral found for patient ${invoice.patientId}`);
      return null;
    }

    // Calculate commission
    const commissionAmount = Math.floor(invoice.amountPaid * referral.influencer.commissionRate);

    // Create commission record
    const commission = await prisma.commission.create({
      data: {
        influencerId: referral.influencerId,
        referralId: referral.id,
        invoiceId: invoice.id,
        orderAmount: invoice.amountPaid,
        commissionRate: referral.influencer.commissionRate,
        commissionAmount,
        status: 'PENDING',
        metadata: {
          patientName: `${invoice.patient.firstName} as any ${invoice.patient.lastName}`,
          invoiceNumber: invoice.stripeInvoiceNumber
        }
      }
    });

    // Update referral as converted
    await prisma.referralTracking.update({
      where: { id: referral.id },
      data: {
        isConverted: true,
        convertedAt: new Date(),
        conversionInvoiceId: invoice.id
      }
    });

    // Mark invoice as commission generated
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { commissionGenerated: true }
    });

    logger.debug(`[Influencer Service] Commission created: $${commissionAmount / 100} for influencer ${referral.influencer.name}`);
    return commission;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Service] Error processing commission:', error);
    return null;
  }
}

/**
 * Get influencer statistics
 */
export async function getInfluencerStats(influencerId: number) {
  try {
    const [
      totalReferrals,
      convertedReferrals,
      pendingCommissions,
      paidCommissions,
      totalEarnings
    ] = await Promise.all([
      // Total referrals
      prisma.referralTracking.count({
        where: { influencerId }
      }),
      // Converted referrals
      prisma.referralTracking.count({
        where: { influencerId, isConverted: true }
      }),
      // Pending commissions
      prisma.commission.aggregate({
        where: { influencerId, status: 'PENDING' },
        _sum: { commissionAmount: true },
        _count: true
      }),
      // Paid commissions
      prisma.commission.aggregate({
        where: { influencerId, status: 'PAID' },
        _sum: { commissionAmount: true },
        _count: true
      }),
      // Total earnings (all approved/paid)
      prisma.commission.aggregate({
        where: { 
          influencerId, 
          status: { in: ['APPROVED', 'PAID'] }
        },
        _sum: { commissionAmount: true }
      })
    ]);

    // Recent referrals
    const recentReferrals = await prisma.referralTracking.findMany({
      where: { influencerId },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Recent commissions
    const recentCommissions = await prisma.commission.findMany({
      where: { influencerId },
      include: {
        referral: {
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return {
      totalReferrals,
      convertedReferrals,
      conversionRate: totalReferrals > 0 ? (convertedReferrals / totalReferrals) * 100 : 0,
      pendingCommissions: {
        count: pendingCommissions._count,
        amount: pendingCommissions._sum.commissionAmount || 0
      },
      paidCommissions: {
        count: paidCommissions._count,
        amount: paidCommissions._sum.commissionAmount || 0
      },
      totalEarnings: totalEarnings._sum.commissionAmount || 0,
      recentReferrals,
      recentCommissions
    };
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Service] Error getting stats:', error);
    throw error;
  }
}

/**
 * Process bulk payout for an influencer
 */
export async function createPayout(
  influencerId: number,
  commissionIds: number[],
  payoutMethod: string,
  payoutReference?: string,
  notes?: string
) {
  try {
    // Get all pending commissions
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commissionIds },
        influencerId,
        status: 'APPROVED'
      }
    });

    if (commissions.length === 0) {
      throw new Error('No approved commissions found for payout');
    }

    const totalAmount = commissions.reduce((sum: number, c: { commissionAmount: number }) => sum + c.commissionAmount, 0);

    // Create payout record
    const payout = await prisma.commissionPayout.create({
      data: {
        influencerId,
        payoutMethod,
        payoutReference,
        totalAmount,
        status: 'PENDING',
        notes,
        metadata: {
          commissionIds,
          commissionCount: commissions.length
        } as any
      }
    });

    // Update commission status
    await prisma.commission.updateMany({
      where: {
        id: { in: commissionIds }
      },
      data: {
        status: 'PAID',
        payoutId: payout.id
      }
    });

    return payout;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Influencer Service] Error creating payout:', error);
    throw error;
  }
}
