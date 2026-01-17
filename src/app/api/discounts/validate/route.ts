import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface ValidationResult {
  valid: boolean;
  error?: string;
  discountCode?: any;
  discountAmount?: number;
  discountPercent?: number;
  finalAmount?: number;
}

// POST - Validate a discount code
async function handlePost(req: NextRequest, user: AuthUser): Promise<NextResponse<ValidationResult | { error: string }>> {
  try {
    const body = await req.json();
    const { code, patientId, orderAmount, productIds, isFirstPurchase } = body;

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Discount code is required' });
    }

    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ valid: false, error: 'Clinic not found' });
    }

    // Find the discount code
    const discountCode = await prisma.discountCode.findFirst({
      where: {
        clinicId,
        code: code.toUpperCase(),
      },
      include: {
        usages: patientId ? {
          where: { patientId: parseInt(patientId) },
        } : false,
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!discountCode) {
      return NextResponse.json({ valid: false, error: 'Invalid discount code' });
    }

    // Check if active
    if (!discountCode.isActive) {
      return NextResponse.json({ valid: false, error: 'This discount code is no longer active' });
    }

    // Check start date
    if (discountCode.startsAt > new Date()) {
      return NextResponse.json({ valid: false, error: 'This discount code is not yet active' });
    }

    // Check expiration
    if (discountCode.expiresAt && discountCode.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, error: 'This discount code has expired' });
    }

    // Check max uses
    if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) {
      return NextResponse.json({ valid: false, error: 'This discount code has reached its usage limit' });
    }

    // Check per-patient limit
    if (patientId && discountCode.maxUsesPerPatient) {
      const patientUsages = Array.isArray(discountCode.usages) ? discountCode.usages.length : 0;
      if (patientUsages >= discountCode.maxUsesPerPatient) {
        return NextResponse.json({ valid: false, error: 'You have already used this discount code the maximum number of times' });
      }
    }

    // Check first-time only
    if (discountCode.firstTimeOnly && patientId && !isFirstPurchase) {
      // Check if patient has any previous orders
      const previousOrders = await prisma.invoice.count({
        where: {
          patientId: parseInt(patientId),
          status: 'PAID',
        },
      });
      if (previousOrders > 0) {
        return NextResponse.json({ valid: false, error: 'This discount code is only valid for first-time customers' });
      }
    }

    // Check minimum order amount
    if (discountCode.minOrderAmount && orderAmount && orderAmount < discountCode.minOrderAmount) {
      const minRequired = (discountCode.minOrderAmount / 100).toFixed(2);
      return NextResponse.json({ 
        valid: false, 
        error: `Minimum order of $${minRequired} required for this discount` 
      });
    }

    // Check product restrictions
    if (productIds && productIds.length > 0) {
      if (discountCode.applyTo === 'LIMITED_PRODUCTS' && discountCode.productIds) {
        const allowedProducts = discountCode.productIds as number[];
        const hasValidProduct = productIds.some((id: number) => allowedProducts.includes(id));
        if (!hasValidProduct) {
          return NextResponse.json({ valid: false, error: 'This discount code is not valid for the selected products' });
        }
      }

      // Check excluded products
      if (discountCode.excludeProductIds) {
        const excludedProducts = discountCode.excludeProductIds as number[];
        const hasExcludedProduct = productIds.some((id: number) => excludedProducts.includes(id));
        if (hasExcludedProduct) {
          return NextResponse.json({ valid: false, error: 'This discount code cannot be applied to some products in your cart' });
        }
      }
    }

    // Calculate discount
    let discountAmount = 0;
    let discountPercent = 0;

    if (orderAmount) {
      if (discountCode.discountType === 'PERCENTAGE') {
        discountPercent = discountCode.discountValue;
        discountAmount = Math.round(orderAmount * (discountCode.discountValue / 100));
      } else if (discountCode.discountType === 'FIXED_AMOUNT') {
        discountAmount = Math.min(discountCode.discountValue, orderAmount);
        discountPercent = (discountAmount / orderAmount) * 100;
      }
    }

    const finalAmount = orderAmount ? Math.max(0, orderAmount - discountAmount) : undefined;

    return NextResponse.json({
      valid: true,
      discountCode: {
        id: discountCode.id,
        code: discountCode.code,
        name: discountCode.name,
        discountType: discountCode.discountType,
        discountValue: discountCode.discountValue,
        applyToRecurring: discountCode.applyToRecurring,
        recurringDuration: discountCode.recurringDuration,
      },
      discountAmount,
      discountPercent,
      finalAmount,
    });
  } catch (error: any) {
    logger.error('[Discount Validate API] Error:', error);
    return NextResponse.json({ error: 'Failed to validate discount code' }, { status: 500 });
  }
}

export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin', 'provider', 'staff'] });
