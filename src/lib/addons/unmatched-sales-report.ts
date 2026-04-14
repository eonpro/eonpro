import { prisma, runWithClinicContext } from '@/lib/db';
import { computeEmailHash } from '@/lib/security/phi-encryption';
import type Stripe from 'stripe';

const ADDON_PRICE_IDS = [
  { priceId: 'price_1TEFKjDfH4PWyxxd4roD32Ae', addonKey: 'elite_bundle' },
  { priceId: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T', addonKey: 'nad_plus' },
  { priceId: 'price_1TEFKJDfH4PWyxxdDZkq3vD5', addonKey: 'sermorelin' },
  { priceId: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt', addonKey: 'b12' },
] as const;

export type UnmatchedReason = 'no_customer_email' | 'no_patient_match';

export interface UnmatchedSaleSample {
  addonKey: string;
  reason: UnmatchedReason;
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  paidAt: string;
}

export interface AddonUnmatchedSalesReport {
  clinicId: number;
  paidSalesChecked: number;
  unmatchedTotal: number;
  grouped: Record<string, { total: number; no_customer_email: number; no_patient_match: number }>;
  samples: UnmatchedSaleSample[];
  lookbackDays: number;
}

interface BuildOptions {
  clinicId: number;
  stripe: Stripe;
  connectOpts: Stripe.RequestOptions;
  lookbackDays?: number;
  sampleLimit?: number;
}

export async function buildAddonUnmatchedSalesReport(
  options: BuildOptions
): Promise<AddonUnmatchedSalesReport> {
  const lookbackDays = options.lookbackDays ?? 7;
  const sampleLimit = options.sampleLimit ?? 20;
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;

  const grouped: Record<
    string,
    { total: number; no_customer_email: number; no_patient_match: number }
  > = {};
  const samples: UnmatchedSaleSample[] = [];

  let paidSalesChecked = 0;
  let unmatchedTotal = 0;

  for (const addon of ADDON_PRICE_IDS) {
    grouped[addon.addonKey] = { total: 0, no_customer_email: 0, no_patient_match: 0 };

    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const page = await options.stripe.subscriptions.list(
        {
          price: addon.priceId,
          status: 'active',
          limit: 100,
          expand: ['data.customer', 'data.latest_invoice'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        options.connectOpts
      );

      for (const sub of page.data) {
        const latestInvoiceRaw = sub.latest_invoice;
        if (!latestInvoiceRaw || typeof latestInvoiceRaw === 'string') continue;
        if (String(latestInvoiceRaw.status || '').toLowerCase() !== 'paid') continue;

        const paidAtEpochSeconds =
          latestInvoiceRaw.status_transitions?.paid_at ?? latestInvoiceRaw.created ?? null;
        if (!paidAtEpochSeconds) continue;

        const paidAt = new Date(paidAtEpochSeconds * 1000);
        const ageMs = Date.now() - paidAt.getTime();
        if (!Number.isFinite(ageMs) || ageMs > lookbackMs) continue;

        const stripeInvoiceId = latestInvoiceRaw.id;
        paidSalesChecked++;

        const existing = await prisma.invoice.findFirst({
          where: { metadata: { path: ['stripeInvoiceId'], equals: stripeInvoiceId } },
          select: { id: true },
        });
        if (existing) continue;

        const customer = sub.customer;
        const customerId = typeof customer === 'string' ? customer : customer?.id;
        const email =
          typeof customer !== 'string' && customer && 'email' in customer
            ? (customer as { email?: string | null }).email?.trim().toLowerCase() || null
            : null;
        const emailHash = computeEmailHash(email);

        let reason: UnmatchedReason;
        if (!email) {
          reason = 'no_customer_email';
        } else {
          const patientMatched = await runWithClinicContext(options.clinicId, async () => {
            const byCustomer = await prisma.patient.findFirst({
              where: { stripeCustomerId: customerId },
              select: { id: true },
            });
            if (byCustomer) return true;

            const bySearchIndex = await prisma.patient.findFirst({
              where: {
                clinicId: options.clinicId,
                searchIndex: { contains: email, mode: 'insensitive' },
              },
              select: { id: true },
              orderBy: { createdAt: 'desc' },
            });
            if (bySearchIndex) return true;

            if (emailHash) {
              const byEmailHash = await prisma.patient.findFirst({
                where: { clinicId: options.clinicId, emailHash },
                select: { id: true },
                orderBy: { createdAt: 'desc' },
              });
              if (byEmailHash) return true;
            }

            return false;
          });

          if (patientMatched) continue;
          reason = 'no_patient_match';
        }

        unmatchedTotal++;
        grouped[addon.addonKey].total++;
        grouped[addon.addonKey][reason]++;

        if (samples.length < sampleLimit) {
          samples.push({
            addonKey: addon.addonKey,
            reason,
            stripeSubscriptionId: sub.id,
            stripeInvoiceId,
            paidAt: paidAt.toISOString(),
          });
        }
      }

      hasMore = page.has_more;
      if (page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id;
      }
    }
  }

  return {
    clinicId: options.clinicId,
    paidSalesChecked,
    unmatchedTotal,
    grouped,
    samples,
    lookbackDays,
  };
}
