#!/usr/bin/env tsx
/**
 * Phase 1.2: Webhook delivery audit for WellMedR Connect subscription events.
 *
 * Pulls all `customer.subscription.*` events from the WellMedR Connect account
 * in the last N hours, then diffs against the local `WebhookLog` (which is
 * written by /api/stripe/webhook on success or failure).
 *
 * Categorises each Stripe event into:
 *  - PROCESSED:   matching WebhookLog row with status=SUCCESS
 *  - FAILED:      matching WebhookLog row with status != SUCCESS
 *  - UNDELIVERED: NO matching WebhookLog row (webhook never reached our handler)
 *
 * If UNDELIVERED is non-zero → webhook delivery problem (Stripe → us).
 * If PROCESSED but no Subscription row → silent-skip in syncSubscriptionFromStripe.
 *
 * Read-only.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import type Stripe from 'stripe';

const HOURS = parseInt(process.env.HOURS ?? '48', 10);
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

interface EventRow {
  eventId: string;
  type: string;
  created: Date;
  subId: string;
  customerId: string;
}

async function main() {
  console.log(`\n=== Phase 1.2: Webhook delivery audit (last ${HOURS}h) ===\n`);

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

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) {
    throw new Error('WellMedR clinic has no Stripe Connect account set');
  }
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };

  const sinceSec = Math.floor((Date.now() - HOURS * 3600 * 1000) / 1000);
  const sinceDate = new Date(sinceSec * 1000);

  // 1) Pull Stripe events of type customer.subscription.* on the Connect account
  console.log(`Fetching customer.subscription.* events from Stripe (since ${sinceDate.toISOString()})…`);
  const eventTypes = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ];

  const allEvents: EventRow[] = [];
  for (const type of eventTypes) {
    let startingAfter: string | undefined;
    let pageNum = 0;
    let typeCount = 0;
    do {
      pageNum++;
      const list = await stripeContext.stripe.events.list(
        {
          type,
          created: { gte: sinceSec },
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        opts,
      );
      for (const e of list.data) {
        const sub = e.data?.object as Stripe.Subscription;
        allEvents.push({
          eventId: e.id,
          type: e.type,
          created: new Date(e.created * 1000),
          subId: sub?.id ?? '(unknown)',
          customerId:
            typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id ?? '(unknown)',
        });
        typeCount++;
      }
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1].id;
    } while (true);
    console.log(`  ${type}: ${typeCount}`);
  }
  console.log(`Total Stripe events: ${allEvents.length}\n`);

  if (allEvents.length === 0) {
    console.log('No subscription events in the window. Nothing to diff.');
    return;
  }

  // 2) Pull WebhookLog rows in the same window with eventType ∈ subscription types and source=stripe
  console.log('Loading local WebhookLog rows…');
  const eventIds = allEvents.map((e) => e.eventId);
  const localLogs = await prisma.webhookLog.findMany({
    where: {
      source: 'stripe',
      eventId: { in: eventIds },
    },
    select: {
      eventId: true,
      eventType: true,
      status: true,
      statusCode: true,
      errorMessage: true,
      processedAt: true,
      clinicId: true,
    },
  });
  const logsByEventId = new Map(localLogs.map((l) => [l.eventId, l]));
  console.log(`Local WebhookLog rows matched: ${localLogs.length}\n`);

  // 3) Categorise
  let processed = 0;
  let failed = 0;
  let undelivered = 0;
  const undeliveredSamples: EventRow[] = [];
  const processedSamples: { evt: EventRow; log: any }[] = [];
  const failedSamples: { evt: EventRow; log: any }[] = [];

  // Also: for "processed" events, check if a local Subscription row now exists for that subId.
  const processedSubIds = new Set<string>();

  for (const evt of allEvents) {
    const log = logsByEventId.get(evt.eventId);
    if (!log) {
      undelivered++;
      if (undeliveredSamples.length < 10) undeliveredSamples.push(evt);
    } else if (log.status === 'SUCCESS') {
      processed++;
      if (processedSamples.length < 10) processedSamples.push({ evt, log });
      processedSubIds.add(evt.subId);
    } else {
      failed++;
      if (failedSamples.length < 10) failedSamples.push({ evt, log });
    }
  }

  // 4) For processed events, check whether a local Subscription row exists for the subId
  let processedAndStored = 0;
  let processedButMissing = 0;
  const processedButMissingSamples: { subId: string; eventId: string }[] = [];
  if (processedSubIds.size > 0) {
    const localSubs = await runWithClinicContext(clinic.id, () =>
      prisma.subscription.findMany({
        where: {
          clinicId: clinic.id,
          stripeSubscriptionId: { in: Array.from(processedSubIds) },
        },
        select: { stripeSubscriptionId: true },
      }),
    );
    const localSubIdSet = new Set(localSubs.map((s) => s.stripeSubscriptionId).filter(Boolean) as string[]);
    for (const subId of processedSubIds) {
      if (localSubIdSet.has(subId)) processedAndStored++;
      else {
        processedButMissing++;
        if (processedButMissingSamples.length < 10) {
          // find an example event
          const evt = allEvents.find((e) => e.subId === subId);
          if (evt) processedButMissingSamples.push({ subId, eventId: evt.eventId });
        }
      }
    }
  }

  console.log('=== Diff Results ===');
  console.log(`Total Stripe events:       ${allEvents.length}`);
  console.log(`  processed (200/SUCCESS): ${processed}`);
  console.log(`  failed (logged != SUCCESS): ${failed}`);
  console.log(`  undelivered (no log):    ${undelivered}`);
  console.log('');
  console.log(`Of processed events, unique subIds:                  ${processedSubIds.size}`);
  console.log(`  → local Subscription row EXISTS for subId:         ${processedAndStored}`);
  console.log(`  → local Subscription row MISSING for subId:        ${processedButMissing}  *** silent skip indicator ***`);

  if (undeliveredSamples.length > 0) {
    console.log('\nSample UNDELIVERED events (no WebhookLog row):');
    for (const e of undeliveredSamples) {
      console.log(`  - ${e.eventId} ${e.type} sub=${e.subId} cust=${e.customerId} at=${e.created.toISOString()}`);
    }
  }

  if (failedSamples.length > 0) {
    console.log('\nSample FAILED events (logged with non-SUCCESS):');
    for (const { evt, log } of failedSamples) {
      console.log(`  - ${evt.eventId} ${evt.type} sub=${evt.subId} status=${log.status} statusCode=${log.statusCode} err="${(log.errorMessage ?? '').slice(0, 80)}"`);
    }
  }

  if (processedButMissingSamples.length > 0) {
    console.log('\nSample PROCESSED-BUT-MISSING (silent-skip suspects):');
    for (const s of processedButMissingSamples) {
      console.log(`  - eventId=${s.eventId} subId=${s.subId}`);
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
