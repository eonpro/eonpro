/**
 * Product/package commission rules: list and create
 *
 * GET  /api/admin/sales-rep/commission-plans/[id]/product-rules
 * POST /api/admin/sales-rep/commission-plans/[id]/product-rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getPlanAndClinic(planId: number, user: AuthUser) {
  const { basePrisma } = await import('@/lib/db');
  const plan = await basePrisma.salesRepCommissionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) return { plan: null as never, clinicId: null };
  if (user.role !== 'super_admin' && plan.clinicId !== user.clinicId) {
    return { plan: null as never, clinicId: null };
  }
  return { plan, clinicId: plan.clinicId };
}

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }
      const { plan, clinicId } = await getPlanAndClinic(planId, user);
      if (!plan || clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const rules = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepProductCommission.findMany({
          where: { planId },
          include: {
            product: {
              select: { id: true, name: true },
            },
            productBundle: {
              select: { id: true, name: true },
            },
          },
          orderBy: { id: 'asc' },
          take: 500,
        })
      );

      return NextResponse.json({
        rules: rules.map((r) => ({
          id: r.id,
          planId: r.planId,
          productId: r.productId,
          product: r.product,
          productBundleId: r.productBundleId,
          productBundle: r.productBundle,
          bonusType: r.bonusType,
          percentBps: r.percentBps,
          flatAmountCents: r.flatAmountCents,
        })),
      });
    } catch (error) {
      logger.error('[Sales Rep Product Rules GET]', error);
      return NextResponse.json({ error: 'Failed to list product rules' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }
      const { plan, clinicId } = await getPlanAndClinic(planId, user);
      if (!plan || clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const body = await req.json();
      const { productId, productBundleId, bonusType, percentBps, flatAmountCents } = body;

      const pid = productId != null ? Number(productId) : null;
      const pbid = productBundleId != null ? Number(productBundleId) : null;
      if ((pid == null || !Number.isInteger(pid)) && (pbid == null || !Number.isInteger(pbid))) {
        return NextResponse.json(
          { error: 'Either productId or productBundleId must be provided (integer)' },
          { status: 400 }
        );
      }
      if (pid != null && pbid != null) {
        return NextResponse.json(
          { error: 'Provide only one of productId or productBundleId' },
          { status: 400 }
        );
      }
      if (bonusType !== 'PERCENT' && bonusType !== 'FLAT') {
        return NextResponse.json(
          { error: 'bonusType must be PERCENT or FLAT' },
          { status: 400 }
        );
      }
      if (bonusType === 'PERCENT') {
        const bps = percentBps != null ? Number(percentBps) : null;
        if (bps == null || bps < 0 || bps > 10000) {
          return NextResponse.json(
            { error: 'percentBps must be 0–10000 (0–100%) when bonusType is PERCENT' },
            { status: 400 }
          );
        }
      } else {
        const cents = flatAmountCents != null ? Number(flatAmountCents) : null;
        if (cents == null || cents < 0) {
          return NextResponse.json(
            { error: 'flatAmountCents must be >= 0 when bonusType is FLAT' },
            { status: 400 }
          );
        }
      }

      // Verify product or bundle belongs to clinic
      if (pid != null) {
        const product = await runWithClinicContext(clinicId, async () =>
          prisma.product.findFirst({ where: { id: pid, clinicId } })
        );
        if (!product) {
          return NextResponse.json({ error: 'Product not found in this clinic' }, { status: 400 });
        }
      }
      if (pbid != null) {
        const bundle = await runWithClinicContext(clinicId, async () =>
          prisma.productBundle.findFirst({ where: { id: pbid, clinicId } })
        );
        if (!bundle) {
          return NextResponse.json({ error: 'Product bundle not found in this clinic' }, { status: 400 });
        }
      }

      const rule = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepProductCommission.create({
          data: {
            planId,
            productId: pid ?? undefined,
            productBundleId: pbid ?? undefined,
            bonusType: bonusType as 'PERCENT' | 'FLAT',
            percentBps: bonusType === 'PERCENT' ? Number(percentBps) : null,
            flatAmountCents: bonusType === 'FLAT' ? Number(flatAmountCents) : null,
          },
          include: {
            product: { select: { id: true, name: true } },
            productBundle: { select: { id: true, name: true } },
          },
        })
      );

      logger.info('[Sales Rep Product Rules] Created', {
        ruleId: rule.id,
        planId,
        productId: pid,
        productBundleId: pbid,
        createdBy: user.id,
      });

      return NextResponse.json({
        success: true,
        rule: {
          id: rule.id,
          planId: rule.planId,
          productId: rule.productId,
          product: rule.product,
          productBundleId: rule.productBundleId,
          productBundle: rule.productBundle,
          bonusType: rule.bonusType,
          percentBps: rule.percentBps,
          flatAmountCents: rule.flatAmountCents,
        },
      });
    } catch (error) {
      logger.error('[Sales Rep Product Rules POST]', error);
      return NextResponse.json({ error: 'Failed to create product rule' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
