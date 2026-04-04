#!/usr/bin/env tsx
/**
 * Backfill stale pending payments that already succeeded on Stripe.
 *
 * Why:
 * Some historical race conditions can leave local Payment rows in PENDING
 * while Stripe shows success (or while a canonical local payment already exists).
 *
 * Safe defaults:
 * - Dry-run by default
 * - Requires --execute to write updates
 *
 * Usage examples:
 *   # Preview stale pending payments (all clinics)
 *   npx tsx scripts/backfill-stale-pending-payments.ts
 *
 *   # Preview only OT clinic candidates
 *   npx tsx scripts/backfill-stale-pending-payments.ts --subdomain=ot
 *
 *   # Execute for OT clinic
 *   npx tsx scripts/backfill-stale-pending-payments.ts --subdomain=ot --execute
 *
 *   # Execute with custom age threshold + batch size
 *   npx tsx scripts/backfill-stale-pending-payments.ts --execute --hours=72 --limit=1000
 */

import * as dotenv from 'dotenv';
import { prisma, withoutClinicFilter } from '../src/lib/db';
import { getStripeForClinic, stripeRequestOptions, type StripeContext } from '../src/lib/stripe/connect';
import { StripePaymentService } from '../src/services/stripe/paymentService';
import type Stripe from 'stripe';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type ScriptOptions = {
  execute: boolean;
  clinicId?: number;
  subdomain?: string;
  hours: number;
  limit: number;
  help: boolean;
};

const CANONICAL_STATUSES = ['SUCCEEDED', 'PROCESSING', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

function parseArgs(argv: string[]): ScriptOptions {
  const args = new Map<string, string | true>();
  for (const arg of argv) {
    if (arg === '--execute') {
      args.set('execute', true);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.set('help', true);
      continue;
    }
    if (arg.startsWith('--clinicId=')) {
      args.set('clinicId', arg.split('=')[1]);
      continue;
    }
    if (arg.startsWith('--subdomain=')) {
      args.set('subdomain', arg.split('=')[1]);
      continue;
    }
    if (arg.startsWith('--hours=')) {
      args.set('hours', arg.split('=')[1]);
      continue;
    }
    if (arg.startsWith('--limit=')) {
      args.set('limit', arg.split('=')[1]);
      continue;
    }
  }

  const clinicIdRaw = args.get('clinicId');
  const clinicId =
    typeof clinicIdRaw === 'string' && clinicIdRaw.trim().length > 0
      ? Number(clinicIdRaw)
      : undefined;
  if (clinicIdRaw && (!clinicId || Number.isNaN(clinicId))) {
    throw new Error(`Invalid --clinicId value: ${String(clinicIdRaw)}`);
  }

  const subdomainRaw = args.get('subdomain');
  const subdomain =
    typeof subdomainRaw === 'string' && subdomainRaw.trim().length > 0
      ? subdomainRaw.trim().toLowerCase()
      : undefined;

  const hoursRaw = args.get('hours');
  const hours =
    typeof hoursRaw === 'string' && hoursRaw.trim().length > 0
      ? Number(hoursRaw)
      : 24;
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`Invalid --hours value: ${String(hoursRaw)}`);
  }

  const limitRaw = args.get('limit');
  const limit =
    typeof limitRaw === 'string' && limitRaw.trim().length > 0
      ? Number(limitRaw)
      : 500;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${String(limitRaw)}`);
  }

  return {
    execute: args.has('execute'),
    clinicId,
    subdomain,
    hours,
    limit: Math.floor(limit),
    help: args.has('help'),
  };
}

function printHelp() {
  console.log(`
Backfill stale pending payments

Options:
  --execute             Apply DB updates (default is dry-run)
  --clinicId=<id>       Restrict to a specific clinic ID
  --subdomain=<slug>    Restrict by clinic subdomain (e.g., ot)
  --hours=<number>      Minimum age for stale pending rows (default: 24)
  --limit=<number>      Max pending rows to scan (default: 500)
  --help, -h            Show this help
`);
}

function resolveClinicId(rowClinicId: number | null, patientClinicId: number | null): number | null {
  if (rowClinicId && rowClinicId > 0) return rowClinicId;
  if (patientClinicId && patientClinicId > 0) return patientClinicId;
  return null;
}

async function findCanonicalPaymentId(payment: {
  id: number;
  patientId: number;
  amount: number;
  createdAt: Date;
  description: string | null;
}): Promise<number | null> {
  const windowMs = 30 * 60 * 1000;
  const from = new Date(payment.createdAt.getTime() - windowMs);
  const to = new Date(payment.createdAt.getTime() + windowMs);

  const candidates = await prisma.payment.findMany({
    where: {
      id: { not: payment.id },
      patientId: payment.patientId,
      amount: payment.amount,
      status: { in: [...CANONICAL_STATUSES] },
      createdAt: { gte: from, lte: to },
      OR: [
        { description: payment.description ?? undefined },
        ...(payment.description === null ? [{ description: null }] : []),
      ],
    },
    select: { id: true, createdAt: true, stripePaymentIntentId: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  if (candidates.length === 0) return null;

  // Pick closest by timestamp, prioritizing rows linked to Stripe intent.
  const sorted = [...candidates].sort((a, b) => {
    const aIntent = a.stripePaymentIntentId ? 0 : 1;
    const bIntent = b.stripePaymentIntentId ? 0 : 1;
    if (aIntent !== bIntent) return aIntent - bIntent;
    return Math.abs(a.createdAt.getTime() - payment.createdAt.getTime()) -
      Math.abs(b.createdAt.getTime() - payment.createdAt.getTime());
  });

  return sorted[0]?.id ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const staleBefore = new Date(Date.now() - options.hours * 60 * 60 * 1000);
  const stripeContextCache = new Map<number, StripeContext>();

  console.log('');
  console.log('=== Backfill Stale Pending Payments ===');
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`Min age: ${options.hours}h (created before ${staleBefore.toISOString()})`);
  console.log(`Limit: ${options.limit}`);
  if (options.clinicId) console.log(`Clinic filter (id): ${options.clinicId}`);
  if (options.subdomain) console.log(`Clinic filter (subdomain): ${options.subdomain}`);
  console.log('');

  await withoutClinicFilter(async () => {
    const clinicBySubdomain = options.subdomain
      ? await prisma.clinic.findFirst({
          where: { subdomain: { equals: options.subdomain, mode: 'insensitive' } },
          select: { id: true, subdomain: true },
        })
      : null;

    if (options.subdomain && !clinicBySubdomain) {
      throw new Error(`No clinic found for subdomain "${options.subdomain}"`);
    }

    const resolvedClinicId = options.clinicId ?? clinicBySubdomain?.id;

    const candidates = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: staleBefore },
        ...(resolvedClinicId ? { OR: [{ clinicId: resolvedClinicId }, { patient: { clinicId: resolvedClinicId } }] } : {}),
      },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        amount: true,
        description: true,
        paymentMethod: true,
        createdAt: true,
        stripePaymentIntentId: true,
        patient: { select: { clinicId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: options.limit,
    });

    if (candidates.length === 0) {
      console.log('No stale pending payment candidates found.');
      return;
    }

    console.log(`Found ${candidates.length} stale pending payment candidate(s).\n`);

    let reconciledViaStripe = 0;
    let markedDuplicate = 0;
    let unresolved = 0;
    let errors = 0;

    for (const payment of candidates) {
      try {
        if (payment.stripePaymentIntentId) {
          const effectiveClinicId = resolveClinicId(payment.clinicId, payment.patient.clinicId);
          if (!effectiveClinicId) {
            console.log(`[UNRESOLVED] paymentId=${payment.id} reason="missing clinic context for Stripe lookup"`);
            unresolved++;
            continue;
          }

          let stripeContext = stripeContextCache.get(effectiveClinicId);
          if (!stripeContext) {
            stripeContext = await getStripeForClinic(effectiveClinicId);
            stripeContextCache.set(effectiveClinicId, stripeContext);
          }

          const requestOptions = stripeRequestOptions(stripeContext);
          const intent = requestOptions
            ? await stripeContext.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, requestOptions)
            : await stripeContext.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

          if (!options.execute) {
            console.log(
              `[DRY] paymentId=${payment.id} intent=${intent.id} stripeStatus=${intent.status} action="would reconcile via webhook logic"`
            );
          } else {
            await StripePaymentService.updatePaymentFromIntent(intent as Stripe.PaymentIntent);
            console.log(
              `[OK] paymentId=${payment.id} intent=${intent.id} stripeStatus=${intent.status} action="reconciled"`
            );
          }
          reconciledViaStripe++;
          continue;
        }

        const canonicalId = await findCanonicalPaymentId({
          id: payment.id,
          patientId: payment.patientId,
          amount: payment.amount,
          createdAt: payment.createdAt,
          description: payment.description,
        });

        if (!canonicalId) {
          console.log(
            `[UNRESOLVED] paymentId=${payment.id} patientId=${payment.patientId} amount=${payment.amount} reason="no canonical payment found"`
          );
          unresolved++;
          continue;
        }

        if (!options.execute) {
          console.log(
            `[DRY] paymentId=${payment.id} action="would mark duplicate failed" canonicalPaymentId=${canonicalId}`
          );
        } else {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              failureReason: `Backfill: stale duplicate pending payment; canonical payment is ${canonicalId}`,
            },
          });
          console.log(
            `[OK] paymentId=${payment.id} action="marked failed duplicate" canonicalPaymentId=${canonicalId}`
          );
        }
        markedDuplicate++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] paymentId=${payment.id} message="${message}"`);
        errors++;
      }
    }

    console.log('\n=== Backfill Complete ===');
    console.log(`Reconciled via Stripe intent: ${reconciledViaStripe}`);
    console.log(`Marked duplicate failed:     ${markedDuplicate}`);
    console.log(`Unresolved:                  ${unresolved}`);
    console.log(`Errors:                      ${errors}`);
    if (!options.execute) {
      console.log('\nRun with --execute to apply DB updates.');
    }
  });
}

main()
  .catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
