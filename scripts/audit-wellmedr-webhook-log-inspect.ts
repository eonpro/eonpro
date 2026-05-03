#!/usr/bin/env tsx
/**
 * Phase 1.3d: Inspect WebhookLog metadata for failing subscription events.
 *
 * For each "processed-but-missing-locally" event, fetch its WebhookLog row
 * and report clinicId, status, errorMessage, processingTimeMs.
 *
 * If clinicId is null, the webhook didn't resolve a clinic → no context →
 * findPatientByStripeCustomerId would throw TenantContextRequiredError.
 *
 * If processingTimeMs is very low (<50ms), it suggests early-return path.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma } from '../src/lib/db';

const EVENT_IDS = [
  'evt_1TSoApDfH4PWyxxddqxJiosi',
  'evt_1TSo6uDfH4PWyxxdA2tsq1G4',
  'evt_1TSo3gDfH4PWyxxd9YoB23VI',
  'evt_1TSntHDfH4PWyxxdEWjtHHX0',
  'evt_1TSnR3DfH4PWyxxdPmo5pZQ5',
  'evt_1TSnPnDfH4PWyxxdRFHY9PBe',
  'evt_1TSnOsDfH4PWyxxdLx9lbbkR',
  'evt_1TSnOEDfH4PWyxxdKTLApeHw',
  'evt_1TSnBZDfH4PWyxxdRt13g8KY',
  'evt_1TSmwuDfH4PWyxxdsGESQvRE',
];

async function main() {
  console.log('\n=== Phase 1.3d: WebhookLog inspection ===\n');

  const logs = await prisma.webhookLog.findMany({
    where: { source: 'stripe', eventId: { in: EVENT_IDS } },
    orderBy: { createdAt: 'asc' },
    select: {
      eventId: true,
      eventType: true,
      clinicId: true,
      status: true,
      statusCode: true,
      errorMessage: true,
      processingTimeMs: true,
      createdAt: true,
      processedAt: true,
    },
  });

  console.log(`Found ${logs.length} log rows for ${EVENT_IDS.length} target events.\n`);
  for (const log of logs) {
    console.log(
      `  ${log.eventId} ${log.eventType}\n    clinicId=${log.clinicId ?? '(null)'} status=${log.status} statusCode=${log.statusCode} processingMs=${log.processingTimeMs} createdAt=${log.createdAt.toISOString()} err="${(log.errorMessage ?? '').slice(0, 100)}"`,
    );
  }

  // Aggregate stats across ALL recent customer.subscription.* logs (last 48h)
  console.log('\n--- 48h aggregate for customer.subscription.* ---');
  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const recent = await prisma.webhookLog.findMany({
    where: {
      source: 'stripe',
      eventType: { startsWith: 'customer.subscription.' },
      createdAt: { gte: since },
    },
    select: { eventType: true, clinicId: true, status: true, processingTimeMs: true },
  });
  console.log(`Total recent rows: ${recent.length}`);
  const clinicNullCount = recent.filter((r) => r.clinicId === null).length;
  console.log(`  with clinicId=null: ${clinicNullCount}`);
  const clinicByCount: Record<string, number> = {};
  for (const r of recent) {
    const k = `clinicId=${r.clinicId ?? 'null'} status=${r.status}`;
    clinicByCount[k] = (clinicByCount[k] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(clinicByCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  const avgMs = recent.reduce((s, r) => s + (r.processingTimeMs ?? 0), 0) / Math.max(1, recent.length);
  console.log(`Average processingMs: ${avgMs.toFixed(1)}`);

  // Distribution of processing times
  const fast = recent.filter((r) => (r.processingTimeMs ?? 0) < 50).length;
  const med = recent.filter((r) => (r.processingTimeMs ?? 0) >= 50 && (r.processingTimeMs ?? 0) < 500).length;
  const slow = recent.filter((r) => (r.processingTimeMs ?? 0) >= 500).length;
  console.log(`Distribution: <50ms=${fast}, 50-500ms=${med}, >=500ms=${slow}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
