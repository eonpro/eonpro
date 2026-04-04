#!/usr/bin/env tsx
/**
 * Backfill Zoom links for upcoming VIDEO appointments.
 *
 * Why:
 * Some historical video appointments may exist without a Zoom meeting/link.
 * This script provisions missing links ahead of appointment time so patients
 * can receive/join with less confusion.
 *
 * Safe defaults:
 * - Dry-run by default (no DB writes or Zoom provisioning)
 * - Requires --execute to perform provisioning
 *
 * Usage examples:
 *   # Preview only (default dry-run)
 *   npx tsx scripts/backfill-zoom-links.ts
 *
 *   # Execute for all upcoming clinics
 *   npx tsx scripts/backfill-zoom-links.ts --execute
 *
 *   # Execute for one clinic, cap to 100 records
 *   npx tsx scripts/backfill-zoom-links.ts --execute --clinicId=7 --limit=100
 *
 *   # Include past appointments from a specific date (ISO)
 *   npx tsx scripts/backfill-zoom-links.ts --execute --from=2026-04-01T00:00:00.000Z
 */

import * as dotenv from 'dotenv';
import { prisma, withoutClinicFilter } from '../src/lib/db';
import { ensureZoomMeetingForAppointment } from '../src/lib/integrations/zoom/telehealthService';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type ScriptOptions = {
  execute: boolean;
  clinicId?: number;
  from: Date;
  limit: number;
  help: boolean;
};

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
    if (arg.startsWith('--from=')) {
      args.set('from', arg.split('=')[1]);
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

  const fromRaw = args.get('from');
  const from =
    typeof fromRaw === 'string' && fromRaw.trim().length > 0 ? new Date(fromRaw) : new Date();
  if (Number.isNaN(from.getTime())) {
    throw new Error(`Invalid --from date: ${String(fromRaw)}`);
  }

  const limitRaw = args.get('limit');
  const limit =
    typeof limitRaw === 'string' && limitRaw.trim().length > 0 ? Number(limitRaw) : 1000;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${String(limitRaw)}`);
  }

  return {
    execute: args.has('execute'),
    clinicId,
    from,
    limit: Math.floor(limit),
    help: args.has('help'),
  };
}

function printHelp() {
  console.log(`
Backfill Zoom links for VIDEO appointments

Options:
  --execute           Actually provision meetings (default is dry-run)
  --clinicId=<id>     Restrict to one clinic
  --from=<ISO date>   Lower bound for appointment start time (default: now)
  --limit=<number>    Max appointments to scan (default: 1000)
  --help, -h          Show this help
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log('');
  console.log('=== Backfill Zoom Links (VIDEO appointments) ===');
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`From: ${options.from.toISOString()}`);
  console.log(`Limit: ${options.limit}`);
  if (options.clinicId) {
    console.log(`Clinic filter: ${options.clinicId}`);
  }
  console.log('');

  await withoutClinicFilter(async () => {
    const candidates = await prisma.appointment.findMany({
      where: {
        type: 'VIDEO',
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startTime: { gte: options.from },
        OR: [{ zoomMeetingId: null }, { zoomJoinUrl: null }, { videoLink: null }],
        ...(options.clinicId ? { clinicId: options.clinicId } : {}),
      },
      select: {
        id: true,
        clinicId: true,
        providerId: true,
        startTime: true,
        zoomMeetingId: true,
        zoomJoinUrl: true,
        videoLink: true,
      },
      orderBy: { startTime: 'asc' },
      take: options.limit,
    });

    if (candidates.length === 0) {
      console.log('No candidate appointments found.');
      return;
    }

    console.log(`Found ${candidates.length} candidate appointment(s).\n`);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const appointment of candidates) {
      if (!options.execute) {
        console.log(
          `[DRY] Would provision appointmentId=${appointment.id} clinicId=${appointment.clinicId ?? 'null'} providerId=${appointment.providerId} start=${appointment.startTime.toISOString()}`
        );
        skippedCount++;
        continue;
      }

      try {
        const result = await ensureZoomMeetingForAppointment(appointment.id);
        if (!result.success) {
          console.log(
            `[SKIP] appointmentId=${appointment.id} reason="${result.error ?? 'unknown'}"`
          );
          skippedCount++;
          continue;
        }

        console.log(`[OK] appointmentId=${appointment.id} zoomMeetingProvisioned`);
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] appointmentId=${appointment.id} message="${message}"`);
        errorCount++;
      }
    }

    console.log('\n=== Backfill Complete ===');
    console.log(`Success: ${successCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors:  ${errorCount}`);
    if (!options.execute) {
      console.log('\nRun with --execute to apply changes.');
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
