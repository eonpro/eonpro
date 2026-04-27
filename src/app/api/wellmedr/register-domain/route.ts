import { NextRequest, NextResponse } from 'next/server';
import {
  getWellMedrConnectStripe,
  getWellMedrConnectOpts,
} from '@/app/wellmedr-checkout/lib/stripe-connect';
import { logger } from '@/lib/logger';

/**
 * Registers payment method domains (Apple Pay, Google Pay, Link) for the
 * WellMedR connected account. Connect platforms using direct charges must
 * register domains via the API — the Dashboard approach only works for
 * the platform's own account.
 *
 * POST /api/wellmedr/register-domain
 * Body: { "domain": "wellmedr.eonpro.io" }
 *
 * Protected by a shared secret so only admins can call it.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.ADMIN_API_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const domain = body?.domain;
    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const stripe = getWellMedrConnectStripe();
    const opts = getWellMedrConnectOpts();

    // List existing domains first
    const existing = await stripe.paymentMethodDomains.list(
      { domain_name: domain, enabled: true },
      opts
    );

    if (existing.data.length > 0) {
      const pmd = existing.data[0];
      logger.info('[PMD] Domain already registered', {
        domain,
        applePay: pmd.apple_pay.status,
        googlePay: pmd.google_pay.status,
        link: pmd.link.status,
      });
      return NextResponse.json({ status: 'already_registered', pmd });
    }

    const pmd = await stripe.paymentMethodDomains.create({ domain_name: domain }, opts);

    logger.info('[PMD] Domain registered for connected account', {
      domain,
      applePay: pmd.apple_pay.status,
      googlePay: pmd.google_pay.status,
      link: pmd.link.status,
    });

    return NextResponse.json({ status: 'registered', pmd });
  } catch (err: any) {
    logger.error('[PMD] Failed to register domain', {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || 'Failed to register domain' },
      { status: 500 }
    );
  }
}
