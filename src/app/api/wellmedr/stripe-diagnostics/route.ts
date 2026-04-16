import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import {
  getWellMedrConnectStripe,
  getWellMedrAccountId,
} from '@/app/wellmedr-checkout/lib/stripe-connect';

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

async function handler(_req: NextRequest, _user: AuthUser) {
  const checks: DiagnosticCheck[] = [];

  // 1. Check env vars are present
  const platformKey = process.env.STRIPE_CONNECT_PLATFORM_SECRET_KEY;
  const accountId = process.env.WELLMEDR_STRIPE_ACCOUNT_ID;
  const clientAccountId = process.env.NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY;

  checks.push({
    name: 'STRIPE_CONNECT_PLATFORM_SECRET_KEY present',
    status: platformKey ? 'pass' : 'fail',
    detail: platformKey
      ? `Set (${platformKey.startsWith('sk_test_') ? 'TEST mode' : 'LIVE mode'})`
      : 'Missing — direct charges will fail',
  });

  checks.push({
    name: 'WELLMEDR_STRIPE_ACCOUNT_ID present and valid',
    status: accountId?.startsWith('acct_') ? 'pass' : 'fail',
    detail: accountId
      ? accountId.startsWith('acct_')
        ? `Set (${accountId.slice(0, 12)}...)`
        : `Invalid format — must start with "acct_" (got "${accountId.slice(0, 8)}...")`
      : 'Missing — stripeAccount header will be omitted',
  });

  checks.push({
    name: 'NEXT_PUBLIC_WELLMEDR_STRIPE_ACCOUNT_ID matches server',
    status: clientAccountId === accountId ? 'pass' : clientAccountId ? 'fail' : 'warn',
    detail:
      clientAccountId === accountId
        ? 'Client and server account IDs match'
        : clientAccountId
          ? 'MISMATCH — client and server will target different accounts'
          : 'Client-side account ID not set — loadStripe will not scope to WellMedR',
  });

  checks.push({
    name: 'NEXT_PUBLIC_STRIPE_CONNECT_PUBLISHABLE_KEY present',
    status: publishableKey ? 'pass' : 'fail',
    detail: publishableKey
      ? `Set (${publishableKey.startsWith('pk_test_') ? 'TEST mode' : 'LIVE mode'})`
      : 'Missing — client-side Stripe.js will not load',
  });

  // 2. Verify the platform key is NOT the connected account's own key
  if (platformKey && accountId?.startsWith('acct_')) {
    try {
      const stripe = getWellMedrConnectStripe();
      const connectedAccountId = getWellMedrAccountId();

      const platformAccount = await stripe.accounts.retrieve(null);
      const platformId = platformAccount.id;

      const isSameAccount = platformId === connectedAccountId;
      checks.push({
        name: 'Platform key differs from connected account',
        status: isSameAccount ? 'fail' : 'pass',
        detail: isSameAccount
          ? `CRITICAL: Platform key belongs to ${platformId} which IS the WellMedR connected account. ` +
            'Charges bypass platform negotiated rate. Update STRIPE_CONNECT_PLATFORM_SECRET_KEY to the EONpro platform key.'
          : `Platform account: ${platformId}, Connected account: ${connectedAccountId} — correctly different`,
      });

      // 3. Verify platform can access connected account
      if (!isSameAccount) {
        try {
          const connectedAccount = await stripe.accounts.retrieve(connectedAccountId);
          checks.push({
            name: 'Platform can access connected account',
            status: 'pass',
            detail: `Account "${connectedAccount.business_profile?.name || connectedAccountId}" accessible`,
          });

          checks.push({
            name: 'Connected account charges enabled',
            status: connectedAccount.charges_enabled ? 'pass' : 'fail',
            detail: connectedAccount.charges_enabled
              ? 'Charges are enabled'
              : 'Charges NOT enabled — payments will fail',
          });

          checks.push({
            name: 'Connected account payouts enabled',
            status: connectedAccount.payouts_enabled ? 'pass' : 'warn',
            detail: connectedAccount.payouts_enabled
              ? 'Payouts are enabled'
              : 'Payouts not enabled — funds may be held',
          });
        } catch (err) {
          checks.push({
            name: 'Platform can access connected account',
            status: 'fail',
            detail: `Failed to retrieve connected account ${connectedAccountId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      }
    } catch (err) {
      checks.push({
        name: 'Stripe API connectivity',
        status: 'fail',
        detail: `Failed to connect to Stripe API: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }

  // 4. Check for legacy/conflicting keys that could cause confusion
  const legacyWellMedrKey = process.env.WELLMEDR_STRIPE_SECRET_KEY;
  if (legacyWellMedrKey) {
    checks.push({
      name: 'No conflicting WELLMEDR_STRIPE_SECRET_KEY',
      status: 'warn',
      detail:
        'WELLMEDR_STRIPE_SECRET_KEY is set. This is not used by the Connect integration ' +
        'but could cause confusion. Consider removing it.',
    });
  }

  const hasFailures = checks.some((c) => c.status === 'fail');

  return NextResponse.json({
    overall: hasFailures ? 'FAIL' : 'PASS',
    timestamp: new Date().toISOString(),
    checks,
  });
}

export const GET = withAdminAuth(handler);
