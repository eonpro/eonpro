import { NextRequest, NextResponse } from 'next/server';
import { basePrisma, prisma as scopedPrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { OT_BILLING_PLANS } from '@/config/ot-billing-plans';
import type { BillingPlan } from '@/config/billingPlans';

/**
 * POST /api/admin/seed-ot-products
 *
 * Seeds the OT clinic (ot.eonpro.io) with its product catalog in the Product
 * table. Each billing plan entry becomes one Product row, linked via
 * metadata.slug so invoices can resolve the productId for financial reporting.
 *
 * Protected by setup secret (same pattern as seed-eonmeds-products).
 */

/** Map OT billing-plan categories to the ProductCategory enum in the DB. */
function mapProductCategory(category: BillingPlan['category']): string {
  switch (category) {
    case 'ot_bloodwork':
      return 'LAB_TEST';
    case 'ot_hormonal':
    case 'ot_prescription_peptides':
    case 'ot_weight_loss':
      return 'MEDICATION';
    case 'ot_research':
      return 'SUPPLEMENT';
    case 'ot_bundles':
      return 'PACKAGE';
    case 'ot_other':
      return 'OTHER';
    default:
      return 'SERVICE';
  }
}

function mapBillingInterval(months?: number): string | null {
  if (!months || months <= 1) return null;
  if (months === 3) return 'QUARTERLY';
  if (months === 6) return 'SEMI_ANNUAL';
  if (months === 12) return 'ANNUAL';
  return 'CUSTOM';
}

function isValidStripePriceId(id?: string): boolean {
  if (!id) return false;
  return id.startsWith('price_') || id === 'TRTSolo1' || id === 'TRTSolo12';
}

function isValidStripeProductId(id?: string): boolean {
  return !!id && id.startsWith('prod_');
}

export async function POST(request: NextRequest) {
  try {
    const setupSecret = request.headers.get('x-setup-secret');
    const expectedSecret =
      process.env.ADMIN_SETUP_SECRET ||
      process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET ||
      process.env.OVERTIME_INTAKE_WEBHOOK_SECRET;

    if (!setupSecret || setupSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ot = await basePrisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'ot' },
          { name: { contains: 'OT', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, subdomain: true },
    });

    if (!ot) {
      return NextResponse.json({ error: 'OT clinic not found' }, { status: 404 });
    }

    logger.info(`[SEED OT PRODUCTS] Seeding products for OT clinic ID: ${ot.id}`);

    return await runWithClinicContext(ot.id, async () => {
      await scopedPrisma.product.deleteMany({ where: { clinicId: ot.id } });
      logger.info(`[SEED OT PRODUCTS] Deleted existing products for clinic ${ot.id}`);

      const createdProducts: Array<{
        name: string;
        price: number;
        slug: string;
        stripePriceId: string | null;
        category: string;
      }> = [];

      const usedStripeProductIds = new Set<string>();

      for (const plan of OT_BILLING_PLANS) {
        const slug = plan.slug || plan.id;
        const productCategory = mapProductCategory(plan.category);
        const billingType =
          plan.isRecurring || (plan.months && plan.months > 1) ? 'RECURRING' : 'ONE_TIME';
        const billingInterval = mapBillingInterval(plan.months);
        const billingIntervalCount = plan.months || 1;
        const stripePriceId = isValidStripePriceId(plan.stripePriceId)
          ? plan.stripePriceId!
          : null;
        const rawStripeProductId = isValidStripeProductId(plan.stripeProductId)
          ? plan.stripeProductId!
          : null;
        const stripeProductId =
          rawStripeProductId && !usedStripeProductIds.has(rawStripeProductId)
            ? rawStripeProductId
            : null;
        if (rawStripeProductId) usedStripeProductIds.add(rawStripeProductId);

        await scopedPrisma.product.create({
          data: {
            clinicId: ot.id,
            name: plan.name,
            shortDescription: plan.description,
            category: productCategory as any,
            price: plan.price,
            currency: 'usd',
            billingType: billingType as any,
            billingInterval: billingInterval as any,
            billingIntervalCount,
            stripeProductId,
            stripePriceId,
            isActive: true,
            isVisible: true,
            metadata: { slug, billingPlanCategory: plan.category },
          },
        });

        createdProducts.push({
          name: plan.name,
          price: plan.price / 100,
          slug,
          stripePriceId,
          category: productCategory,
        });
      }

      logger.info(`[SEED OT PRODUCTS] Created ${createdProducts.length} products for OT`);

      return NextResponse.json({
        success: true,
        clinic: { id: ot.id, name: ot.name },
        products: {
          created: createdProducts.length,
          withStripePriceId: createdProducts.filter((p) => p.stripePriceId).length,
          items: createdProducts,
        },
      });
    });
  } catch (error: unknown) {
    logger.error('[SEED OT PRODUCTS] Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : String(error) || 'Failed to seed OT products',
      },
      { status: 500 }
    );
  }
}
