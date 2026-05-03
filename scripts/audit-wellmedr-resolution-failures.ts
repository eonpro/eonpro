#!/usr/bin/env tsx
/**
 * Phase 1.3: Sample missing subs and classify resolution failure modes.
 *
 * Picks N (default 20) ACTIVE Stripe subs that have no local Subscription row,
 * and for each tries to resolve a patient via the same paths
 * `syncSubscriptionFromStripe` uses, plus by metadata/userId, plus across all
 * clinics. Classifies the failure as one of:
 *   - PATIENT_NOT_IN_DB        (truly no patient row)
 *   - PATIENT_IN_DIFFERENT_CLINIC
 *   - WOULD_RESOLVE_BY_EMAIL   (the email fallback should have worked)
 *   - WOULD_RESOLVE_BY_METADATA_EMAIL
 *   - PATIENT_BY_METADATA_USERID
 *
 * Read-only.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { findPatientByEmail } from '../src/services/stripe/paymentMatchingService';
import type Stripe from 'stripe';

const SAMPLE_N = parseInt(process.env.SAMPLE_N ?? '30', 10);
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

interface Classification {
  subId: string;
  customerId: string;
  customerEmail: string | null;
  customerEmailLower: string | null;
  metadataEmail: string | null;
  customerMetadataEmail: string | null;
  metadataUserId: string | null;
  classification: string;
  patientId?: number;
  patientClinicId?: number;
}

async function main() {
  console.log(`\n=== Phase 1.3: Resolution failure mode sampling (N=${SAMPLE_N}) ===\n`);

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
  console.log(`WellMedR clinic: id=${clinic.id}\n`);

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) throw new Error('No Stripe Connect account');
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };

  // Build set of local stripeSubscriptionIds for WellMedR
  const localSubs = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findMany({
      where: { clinicId: clinic.id, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    }),
  );
  const localSet = new Set(localSubs.map((s) => s.stripeSubscriptionId).filter(Boolean) as string[]);

  // Walk Stripe ACTIVE subs, collect first SAMPLE_N that aren't in localSet.
  const samples: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  while (samples.length < SAMPLE_N) {
    const list = await stripeContext.stripe.subscriptions.list(
      {
        status: 'active',
        limit: 100,
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      opts,
    );
    for (const sub of list.data) {
      if (samples.length >= SAMPLE_N) break;
      if (!localSet.has(sub.id)) samples.push(sub);
    }
    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1].id;
  }

  console.log(`Sampled ${samples.length} ACTIVE Stripe subs missing locally.\n`);

  const results: Classification[] = [];

  // Wrap all sample lookups in WellMedR clinic context (mirrors webhook runtime context).
  await runWithClinicContext(clinic.id, async () => {
  for (const sub of samples) {
    const customer = sub.customer;
    const customerId = typeof customer === 'string' ? customer : customer?.id ?? '';
    let customerEmail: string | null = null;
    let customerMetadataEmail: string | null = null;
    if (typeof customer === 'object' && customer && !('deleted' in customer && customer.deleted)) {
      customerEmail = (customer as Stripe.Customer).email ?? null;
      customerMetadataEmail = (customer as Stripe.Customer).metadata?.email ?? null;
    }
    const metadataEmail = (sub.metadata?.email as string | undefined) ?? null;
    const metadataUserId = (sub.metadata?.userId as string | undefined) ?? null;

    const customerEmailLower = customerEmail?.trim().toLowerCase() ?? null;
    const metadataEmailLower = metadataEmail?.trim().toLowerCase() ?? null;
    const customerMetadataEmailLower = customerMetadataEmail?.trim().toLowerCase() ?? null;

    let classification = 'UNKNOWN';
    let patientId: number | undefined;
    let patientClinicId: number | undefined;

    // 1) Patient by stripeCustomerId (fast path), regardless of clinic
    const byCustomer = await prisma.patient.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, clinicId: true },
    });
    if (byCustomer) {
      patientId = byCustomer.id;
      patientClinicId = byCustomer.clinicId ?? undefined;
      if (byCustomer.clinicId === clinic.id) {
        classification = 'PATIENT_BY_CUSTOMERID_SAME_CLINIC (fast path should have matched!)';
      } else {
        classification = `PATIENT_BY_CUSTOMERID_DIFFERENT_CLINIC (clinic=${byCustomer.clinicId})`;
      }
    } else if (customerEmailLower) {
      // 2) Patient by email scoped to clinic
      const byEmailScoped = await runWithClinicContext(clinic.id, () =>
        findPatientByEmail(customerEmailLower, clinic.id),
      );
      if (byEmailScoped) {
        patientId = byEmailScoped.id;
        patientClinicId = byEmailScoped.clinicId ?? undefined;
        classification = 'WOULD_RESOLVE_BY_EMAIL (email fallback should have worked!)';
      } else {
        // 3) Patient by email across all clinics
        const byEmailGlobal = await runWithClinicContext(clinic.id, () =>
          findPatientByEmail(customerEmailLower),
        );
        if (byEmailGlobal) {
          patientId = byEmailGlobal.id;
          patientClinicId = byEmailGlobal.clinicId ?? undefined;
          classification = `PATIENT_IN_DIFFERENT_CLINIC (clinic=${byEmailGlobal.clinicId})`;
        } else if (metadataEmailLower && metadataEmailLower !== customerEmailLower) {
          // 4) Try metadata.email if different
          const byMetaEmail = await runWithClinicContext(clinic.id, () =>
            findPatientByEmail(metadataEmailLower, clinic.id),
          );
          if (byMetaEmail) {
            patientId = byMetaEmail.id;
            patientClinicId = byMetaEmail.clinicId ?? undefined;
            classification = 'WOULD_RESOLVE_BY_METADATA_EMAIL';
          } else {
            classification = 'PATIENT_NOT_IN_DB';
          }
        } else if (customerMetadataEmailLower && customerMetadataEmailLower !== customerEmailLower) {
          const byCustMeta = await runWithClinicContext(clinic.id, () =>
            findPatientByEmail(customerMetadataEmailLower, clinic.id),
          );
          if (byCustMeta) {
            patientId = byCustMeta.id;
            patientClinicId = byCustMeta.clinicId ?? undefined;
            classification = 'WOULD_RESOLVE_BY_CUSTOMER_METADATA_EMAIL';
          } else {
            classification = 'PATIENT_NOT_IN_DB';
          }
        } else {
          classification = 'PATIENT_NOT_IN_DB';
        }
      }
    } else if (metadataEmailLower) {
      const byMetaEmail = await runWithClinicContext(clinic.id, () =>
        findPatientByEmail(metadataEmailLower, clinic.id),
      );
      if (byMetaEmail) {
        patientId = byMetaEmail.id;
        patientClinicId = byMetaEmail.clinicId ?? undefined;
        classification = 'WOULD_RESOLVE_BY_METADATA_EMAIL (customer.email was null)';
      } else {
        classification = 'PATIENT_NOT_IN_DB (customer.email null + metadata email no match)';
      }
    } else {
      classification = 'NO_EMAIL_AVAILABLE';
    }

    results.push({
      subId: sub.id,
      customerId,
      customerEmail,
      customerEmailLower,
      metadataEmail,
      customerMetadataEmail,
      metadataUserId,
      classification,
      patientId,
      patientClinicId,
    });
  }
  });

  // Tally
  const tally: Record<string, number> = {};
  for (const r of results) {
    const key = r.classification.split(' ')[0];
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log('=== Tally ===');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log('\n=== Detail ===');
  for (const r of results) {
    console.log(
      `  ${r.subId}  cust=${r.customerId}  email=${r.customerEmail ?? '(null)'}  metaEmail=${r.metadataEmail ?? '(null)'}  metaUserId=${r.metadataUserId ?? '(null)'}\n      → ${r.classification}${r.patientId ? `  patient=${r.patientId}` : ''}`,
    );
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
