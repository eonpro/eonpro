#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

import { prisma } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { getStripeClient } from '../src/lib/stripe/config';

async function main() {
  const customerId = process.argv[2] ?? 'cus_URgYAwm11JEWJk';

  const ctx = await getStripeForClinic(7);

  console.log('Via getStripeClient (PLATFORM):');
  const platform = getStripeClient();
  if (platform) {
    try {
      const cust = await platform.customers.retrieve(
        customerId,
        {},
        { stripeAccount: ctx.stripeAccountId },
      );
      console.log(`  ${JSON.stringify(cust)}`);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\nVia getStripeForClinic (CONNECT):');
  try {
    const cust2 = await ctx.stripe.customers.retrieve(
      customerId,
      {},
      { stripeAccount: ctx.stripeAccountId },
    );
    console.log(`  ${JSON.stringify(cust2)}`);
  } catch (err) {
    console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
