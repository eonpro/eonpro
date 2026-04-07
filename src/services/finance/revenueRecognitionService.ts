/**
 * Revenue Recognition Service (ASC 606 / IFRS 15)
 *
 * Manages deferred revenue tracking for subscriptions and multi-period charges.
 * Creates recognition entries when payments are received, and processes monthly
 * recognition by moving deferred amounts to recognized revenue.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStripeForClinic, getStripeForPlatform } from '@/lib/stripe/connect';
import type Stripe from 'stripe';

const fmt = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════════════════════
// CREATE RECOGNITION ENTRIES
// ═══════════════════════════════════════════════════════════════════════════

interface CreateEntryInput {
  clinicId: number;
  stripeChargeId?: string;
  stripeSubscriptionId?: string;
  invoiceItemId?: number;
  description?: string;
  totalAmountCents: number;
  recognitionStart: Date;
  recognitionEnd: Date;
  schedule?: 'immediate' | 'over_period' | 'monthly';
}

export async function createRecognitionEntry(input: CreateEntryInput) {
  const schedule = input.schedule || 'over_period';
  const isImmediate = schedule === 'immediate';

  const entry = await prisma.revenueRecognitionEntry.create({
    data: {
      clinicId: input.clinicId,
      stripeChargeId: input.stripeChargeId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      invoiceItemId: input.invoiceItemId,
      description: input.description,
      totalAmountCents: input.totalAmountCents,
      recognizedCents: isImmediate ? input.totalAmountCents : 0,
      deferredCents: isImmediate ? 0 : input.totalAmountCents,
      recognitionStart: input.recognitionStart,
      recognitionEnd: input.recognitionEnd,
      schedule,
      status: isImmediate ? 'complete' : 'pending',
    },
  });

  if (isImmediate) {
    await prisma.revenueRecognitionJournal.create({
      data: {
        entryId: entry.id,
        periodStart: input.recognitionStart,
        periodEnd: input.recognitionEnd,
        amountCents: input.totalAmountCents,
        journalType: 'recognize_revenue',
        notes: 'Immediate recognition',
      },
    });
  }

  logger.info('[RevRec] Created entry', {
    entryId: entry.id,
    clinicId: input.clinicId,
    amount: input.totalAmountCents,
    schedule,
  });

  return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESS MONTHLY RECOGNITION
// ═══════════════════════════════════════════════════════════════════════════

export async function processMonthlyRecognition(periodMonth?: string) {
  const now = new Date();
  const year = periodMonth ? parseInt(periodMonth.split('-')[0]) : now.getFullYear();
  const month = periodMonth ? parseInt(periodMonth.split('-')[1]) - 1 : now.getMonth();

  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const pendingEntries = await prisma.revenueRecognitionEntry.findMany({
    where: {
      status: { in: ['pending', 'partial'] },
      recognitionStart: { lte: periodEnd },
      recognitionEnd: { gte: periodStart },
    },
  });

  let processed = 0;
  let totalRecognized = 0;

  for (const entry of pendingEntries) {
    if (entry.deferredCents <= 0) continue;

    const totalMonths = monthDiff(entry.recognitionStart, entry.recognitionEnd);
    if (totalMonths <= 0) continue;

    const monthlyAmount = Math.round(entry.totalAmountCents / totalMonths);
    const remaining = entry.deferredCents;
    const recognizeAmount = Math.min(monthlyAmount, remaining);

    if (recognizeAmount <= 0) continue;

    const alreadyRecognized = await prisma.revenueRecognitionJournal.findFirst({
      where: {
        entryId: entry.id,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });

    if (alreadyRecognized) continue;

    const newRecognized = entry.recognizedCents + recognizeAmount;
    const newDeferred = entry.totalAmountCents - newRecognized;
    const isComplete = newDeferred <= 0 || periodEnd >= entry.recognitionEnd;

    await prisma.$transaction([
      prisma.revenueRecognitionJournal.create({
        data: {
          entryId: entry.id,
          periodStart,
          periodEnd,
          amountCents: recognizeAmount,
          journalType: 'recognize_revenue',
        },
      }),
      prisma.revenueRecognitionEntry.update({
        where: { id: entry.id },
        data: {
          recognizedCents: newRecognized,
          deferredCents: Math.max(0, newDeferred),
          status: isComplete ? 'complete' : 'partial',
        },
      }),
    ]);

    processed++;
    totalRecognized += recognizeAmount;
  }

  logger.info('[RevRec] Monthly processing complete', {
    period: `${year}-${String(month + 1).padStart(2, '0')}`,
    entriesProcessed: processed,
    totalRecognized,
  });

  return { processed, totalRecognized, period: `${year}-${String(month + 1).padStart(2, '0')}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// WATERFALL REPORT
// ═══════════════════════════════════════════════════════════════════════════

export async function getRevenueWaterfall(clinicId?: number, months = 12) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

  const where: any = {
    recognitionStart: { lte: now },
    recognitionEnd: { gte: startDate },
  };
  if (clinicId) where.clinicId = clinicId;

  const entries = await prisma.revenueRecognitionEntry.findMany({
    where,
    include: { journalEntries: true },
  });

  const monthRange: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthRange.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const waterfall = monthRange.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    const mStart = new Date(y, mo - 1, 1);
    const mEnd = new Date(y, mo, 0, 23, 59, 59);

    let recognized = 0;
    let deferred = 0;
    let newDeferred = 0;

    for (const entry of entries) {
      for (const je of entry.journalEntries) {
        if (je.periodStart >= mStart && je.periodStart <= mEnd && je.journalType === 'recognize_revenue') {
          recognized += je.amountCents;
        }
      }

      if (entry.recognitionStart >= mStart && entry.recognitionStart <= mEnd) {
        newDeferred += entry.totalAmountCents;
      }

      if (entry.recognitionEnd >= mStart && entry.deferredCents > 0) {
        const totalMonths = monthDiff(entry.recognitionStart, entry.recognitionEnd);
        const monthsRemaining = monthDiff(mEnd, entry.recognitionEnd);
        if (monthsRemaining > 0 && totalMonths > 0) {
          deferred += Math.round((entry.totalAmountCents / totalMonths) * monthsRemaining);
        }
      }
    }

    return {
      month: m,
      recognized,
      recognizedFormatted: fmt(recognized),
      deferred,
      deferredFormatted: fmt(deferred),
      newDeferred,
      newDeferredFormatted: fmt(newDeferred),
      total: recognized + deferred,
      totalFormatted: fmt(recognized + deferred),
    };
  });

  const totals = {
    totalRecognized: entries.reduce((s, e) => s + e.recognizedCents, 0),
    totalDeferred: entries.reduce((s, e) => s + e.deferredCents, 0),
    totalEntries: entries.length,
    pendingEntries: entries.filter((e) => e.status === 'pending').length,
    partialEntries: entries.filter((e) => e.status === 'partial').length,
    completeEntries: entries.filter((e) => e.status === 'complete').length,
  };

  return { waterfall, totals, entries: entries.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL ENTRIES LIST
// ═══════════════════════════════════════════════════════════════════════════

export async function getJournalEntries(clinicId?: number, limit = 100, offset = 0) {
  const where: any = {};
  if (clinicId) {
    where.entry = { clinicId };
  }

  const [journals, total] = await Promise.all([
    prisma.revenueRecognitionJournal.findMany({
      where,
      include: {
        entry: {
          select: {
            id: true,
            clinicId: true,
            description: true,
            stripeChargeId: true,
            totalAmountCents: true,
            schedule: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.revenueRecognitionJournal.count({ where }),
  ]);

  return {
    journals: journals.map((j) => ({
      id: j.id,
      entryId: j.entryId,
      periodStart: j.periodStart.toISOString(),
      periodEnd: j.periodEnd.toISOString(),
      amount: j.amountCents,
      amountFormatted: fmt(j.amountCents),
      journalType: j.journalType,
      notes: j.notes,
      createdAt: j.createdAt.toISOString(),
      entry: {
        id: j.entry.id,
        description: j.entry.description,
        stripeChargeId: j.entry.stripeChargeId,
        totalAmount: j.entry.totalAmountCents,
        totalAmountFormatted: fmt(j.entry.totalAmountCents),
        schedule: j.entry.schedule,
        status: j.entry.status,
      },
    })),
    total,
    limit,
    offset,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-CREATE FROM STRIPE SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function syncSubscriptionEntries(clinicId: number) {
  const ctx = await getStripeForClinic(clinicId);
  const connOpts = ctx.stripeAccountId ? { stripeAccount: ctx.stripeAccountId } : {};

  const subs = await ctx.stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price'],
    ...connOpts,
  } as any);

  let created = 0;
  let skipped = 0;

  for (const sub of subs.data) {
    const existing = await prisma.revenueRecognitionEntry.findFirst({
      where: { stripeSubscriptionId: sub.id, clinicId },
    });

    if (existing) { skipped++; continue; }

    const item = sub.items?.data?.[0];
    const price = item?.price;
    if (!price?.unit_amount) { skipped++; continue; }

    const amount = price.unit_amount * (item.quantity || 1);
    const interval = price.recurring?.interval || 'month';
    const intervalCount = price.recurring?.interval_count || 1;

    const startDate = new Date((sub as any).current_period_start * 1000);
    const endDate = new Date((sub as any).current_period_end * 1000);

    await createRecognitionEntry({
      clinicId,
      stripeSubscriptionId: sub.id,
      description: `Subscription: ${price.nickname || price.product || sub.id}`,
      totalAmountCents: amount,
      recognitionStart: startDate,
      recognitionEnd: endDate,
      schedule: interval === 'month' && intervalCount === 1 ? 'immediate' : 'over_period',
    });

    created++;
  }

  return { created, skipped, total: subs.data.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function monthDiff(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}
