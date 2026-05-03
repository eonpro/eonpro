#!/usr/bin/env tsx
/**
 * Phase 1.1 diagnostic: list Stripe webhook endpoints and their enabled events.
 *
 * Reports both:
 *  - Platform-level endpoints (these receive Connect events from connected
 *    accounts via `event.account`).
 *  - Account-level endpoints registered directly on the WellMedR Connect account
 *    (rare — usually only platform endpoints handle Connect events).
 *
 * For each endpoint, checks whether the `customer.subscription.*` events are
 * subscribed. Read-only.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { getStripeClient } from '../src/lib/stripe/config';

const SUB_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
];

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

function reportEndpoint(label: string, ep: any) {
  console.log(`\n  ${label}`);
  console.log(`    id:               ${ep.id}`);
  console.log(`    url:              ${ep.url}`);
  console.log(`    status:           ${ep.status}`);
  console.log(`    api_version:      ${ep.api_version ?? '(latest)'}`);
  console.log(`    application:      ${ep.application ?? '(none)'}`);
  const events: string[] = ep.enabled_events ?? [];
  const isWildcard = events.includes('*');
  console.log(`    enabled_events:   ${events.length} types${isWildcard ? ' (includes wildcard *)' : ''}`);
  console.log('    subscription event coverage:');
  for (const type of SUB_EVENT_TYPES) {
    const covered = isWildcard || events.includes(type);
    console.log(`      ${covered ? 'YES' : 'NO '}  ${type}`);
  }
  const livemode = ep.livemode;
  console.log(`    livemode:         ${livemode}`);
}

async function main() {
  console.log('\n=== Phase 1.1: Webhook endpoint coverage audit (read-only) ===\n');

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true, stripeAccountId: true },
  });
  if (!clinic) throw new Error('WellMedR clinic not found');
  console.log(`WellMedR clinic: id=${clinic.id} stripeAccountId=${clinic.stripeAccountId}\n`);

  // 1) Platform-level endpoints: no stripeAccount header. These are what receives Connect events.
  console.log('=== PLATFORM-LEVEL WEBHOOK ENDPOINTS ===');
  console.log('(These receive events for ALL connected accounts via event.account)');
  const platformStripe = getStripeClient();
  if (!platformStripe) {
    console.error('No platform Stripe client configured (STRIPE_SECRET_KEY env missing).');
  } else {
    try {
      const platformEndpoints = await platformStripe.webhookEndpoints.list({ limit: 100 });
      console.log(`Total platform endpoints: ${platformEndpoints.data.length}`);
      for (const ep of platformEndpoints.data) {
        reportEndpoint(`endpoint ${ep.id}`, ep);
      }
    } catch (err) {
      console.error(`Platform list failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2) Account-level endpoints registered ON the WellMedR Connect account itself.
  console.log('\n=== ACCOUNT-LEVEL WEBHOOK ENDPOINTS (on WellMedR Connect account) ===');
  console.log('(Rare — usually only platform endpoints handle Connect events)');
  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) {
    console.error('WellMedR clinic has no Stripe Connect account set.');
  } else {
    try {
      const accountEndpoints = await stripeContext.stripe.webhookEndpoints.list(
        { limit: 100 },
        { stripeAccount: stripeContext.stripeAccountId },
      );
      console.log(`Total account endpoints: ${accountEndpoints.data.length}`);
      if (accountEndpoints.data.length === 0) {
        console.log('(no endpoints registered on the connected account)');
      }
      for (const ep of accountEndpoints.data) {
        reportEndpoint(`endpoint ${ep.id}`, ep);
      }
    } catch (err) {
      console.error(`Account list failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\n=== Done ===\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
