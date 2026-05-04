#!/usr/bin/env tsx
/**
 * Diagnostic: Patient portal "Your Dosing Schedule" widget
 *
 * Reproduces what the patient portal sees for a given patient. Prints:
 *   1. Each Order (newest first) with its Rx rows: medName / quantity /
 *      daysSupply / raw sig.
 *   2. For each injectable Rx, the result of parseMultiMonthDirections()
 *      (segments + dose tuples) so we can see which branch the schedule
 *      builder will take.
 *   3. The schedule that the CURRENT (buggy) medications/page.tsx logic
 *      would render — i.e. legacy "stack every Rx sequentially with a
 *      vial-volume estimator".
 *   4. The schedule that the NEW "newest Rx wins globally" rule renders.
 *
 * READ-ONLY. PHI-safe (never decrypts patient names/email/DOB; only uses
 * the public-facing `patientId` like "WEL-78965020").
 *
 * Usage:
 *   tsx scripts/diag-patient-dose-schedule.ts --patientId WEL-78965020
 *   tsx scripts/diag-patient-dose-schedule.ts --patientId WEL-78965020 --patientId WEL-78934042
 *
 * Production DB:
 *   env $(grep -v '^#' .env.production.local | xargs) \
 *     tsx scripts/diag-patient-dose-schedule.ts --patientId WEL-78965020
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

import { basePrisma } from '../src/lib/db';
import {
  parseMultiMonthDirections,
  parseDoseFromDirections,
  isInjectableMedication,
  isSupplyMedication,
  extractMlValue,
} from '../src/lib/utils/rx-sig-parser';

type RxRow = {
  id: number;
  medName: string;
  strength: string | null;
  form: string | null;
  quantity: string | null;
  sig: string | null;
  daysSupply: number;
};

type OrderRow = {
  id: number;
  status: string | null;
  createdAt: Date;
  rxs: RxRow[];
};

const WEEKS_PER_MONTH = 4;

function getArgs(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) {
      out.push(process.argv[i + 1]);
    }
  }
  return out;
}

function hr(label?: string) {
  console.log('');
  console.log('='.repeat(80));
  if (label) {
    console.log(label);
    console.log('='.repeat(80));
  }
}

function fmtDose(dose: { mg: string; units: string } | null): string {
  if (!dose) return 'null';
  return `${dose.units || '?'}u / ${dose.mg || '?'}mg`;
}

type ScheduleItem = {
  monthNumber: number;
  weekStart: number;
  weekEnd: number;
  rxId: number;
  date: Date;
  medName: string;
  doseLabel: string;
  source: 'multi-month-tag' | 'vial-volume-estimator';
  isTitration: boolean;
  isSameDose: boolean;
};

function buildLegacyStackedSchedule(orders: OrderRow[]): ScheduleItem[] {
  const all = [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const items: ScheduleItem[] = [];
  let monthNum = 0;
  let weekCursor = 1;
  let prevDoseKey = '';

  for (const order of all) {
    const injectables = order.rxs.filter(
      (r) => isInjectableMedication(r.medName) && !isSupplyMedication(r.medName)
    );
    if (injectables.length === 0) continue;

    for (const med of injectables) {
      const sig = med.sig ?? '';
      const multi = parseMultiMonthDirections(sig);

      if (multi && multi.length >= 1) {
        for (const seg of multi) {
          monthNum++;
          const weekStart = weekCursor;
          const weekEnd = weekCursor + seg.weeks - 1;
          const doseKey = seg.dose ? `${seg.dose.mg}-${seg.dose.units}` : seg.segment;
          const isTitration = prevDoseKey !== '' && doseKey !== prevDoseKey;
          const isSameDose = prevDoseKey !== '' && doseKey === prevDoseKey;
          prevDoseKey = doseKey;

          items.push({
            monthNumber: monthNum,
            weekStart,
            weekEnd,
            rxId: med.id,
            date: order.createdAt,
            medName: med.medName,
            doseLabel: fmtDose(seg.dose),
            source: 'multi-month-tag',
            isTitration,
            isSameDose,
          });
          weekCursor += seg.weeks;
        }
      } else {
        const weeksFromDaysSupply = med.daysSupply > 0 ? Math.round(med.daysSupply / 7) : 0;
        let weeksFromVial = 0;
        const vialMl = extractMlValue(med.quantity, med.medName, med.form);
        const parsed = parseDoseFromDirections(sig);
        if (vialMl && parsed?.units) {
          const mlPerInjection = parseFloat(parsed.units) / 100;
          if (mlPerInjection > 0) weeksFromVial = Math.floor(parseFloat(vialMl) / mlPerInjection);
        }
        const weeks = Math.max(weeksFromDaysSupply, weeksFromVial) || 4;
        const monthsCovered = Math.max(1, Math.ceil(weeks / WEEKS_PER_MONTH));

        const dose = parsed;
        const doseKey = dose ? `${dose.mg}-${dose.units}` : sig;
        const isTitration = prevDoseKey !== '' && doseKey !== prevDoseKey;
        const isSameDose = prevDoseKey !== '' && doseKey === prevDoseKey;
        prevDoseKey = doseKey;

        for (let m = 0; m < monthsCovered; m++) {
          monthNum++;
          const wStart = weekCursor + m * WEEKS_PER_MONTH;
          const wEnd = Math.min(wStart + WEEKS_PER_MONTH - 1, weekCursor + weeks - 1);
          items.push({
            monthNumber: monthNum,
            weekStart: wStart,
            weekEnd: wEnd,
            rxId: med.id,
            date: order.createdAt,
            medName: med.medName,
            doseLabel: fmtDose(dose),
            source: 'vial-volume-estimator',
            isTitration: m === 0 ? isTitration : false,
            isSameDose: m === 0 ? isSameDose : true,
          });
        }
        weekCursor += weeks;
      }
    }
  }
  return items;
}

function buildNewestWinsSchedule(orders: OrderRow[]): {
  items: ScheduleItem[];
  sourceOrderId: number | null;
} {
  const ordersWithInjectables = orders.filter((o) =>
    o.rxs.some((r) => isInjectableMedication(r.medName) && !isSupplyMedication(r.medName))
  );
  if (ordersWithInjectables.length === 0) return { items: [], sourceOrderId: null };

  const newest = [...ordersWithInjectables].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];

  const items: ScheduleItem[] = [];
  let monthNum = 0;
  let weekCursor = 1;
  let prevDoseKey = '';

  const injectables = newest.rxs.filter(
    (r) => isInjectableMedication(r.medName) && !isSupplyMedication(r.medName)
  );
  for (const med of injectables) {
    const sig = med.sig ?? '';
    const multi = parseMultiMonthDirections(sig);

    if (multi && multi.length >= 1) {
      for (const seg of multi) {
        monthNum++;
        const weekStart = weekCursor;
        const weekEnd = weekCursor + seg.weeks - 1;
        const doseKey = seg.dose ? `${seg.dose.mg}-${seg.dose.units}` : seg.segment;
        const isTitration = prevDoseKey !== '' && doseKey !== prevDoseKey;
        const isSameDose = prevDoseKey !== '' && doseKey === prevDoseKey;
        prevDoseKey = doseKey;
        items.push({
          monthNumber: monthNum,
          weekStart,
          weekEnd,
          rxId: med.id,
          date: newest.createdAt,
          medName: med.medName,
          doseLabel: fmtDose(seg.dose),
          source: 'multi-month-tag',
          isTitration,
          isSameDose,
        });
        weekCursor += seg.weeks;
      }
    } else {
      const weeksFromDaysSupply = med.daysSupply > 0 ? Math.round(med.daysSupply / 7) : 0;
      let weeksFromVial = 0;
      const vialMl = extractMlValue(med.quantity, med.medName, med.form);
      const parsed = parseDoseFromDirections(sig);
      if (vialMl && parsed?.units) {
        const mlPerInjection = parseFloat(parsed.units) / 100;
        if (mlPerInjection > 0) weeksFromVial = Math.floor(parseFloat(vialMl) / mlPerInjection);
      }
      const weeks = Math.max(weeksFromDaysSupply, weeksFromVial) || 4;
      const monthsCovered = Math.max(1, Math.ceil(weeks / WEEKS_PER_MONTH));
      const dose = parsed;
      const doseKey = dose ? `${dose.mg}-${dose.units}` : sig;
      const isTitration = prevDoseKey !== '' && doseKey !== prevDoseKey;
      const isSameDose = prevDoseKey !== '' && doseKey === prevDoseKey;
      prevDoseKey = doseKey;

      for (let m = 0; m < monthsCovered; m++) {
        monthNum++;
        const wStart = weekCursor + m * WEEKS_PER_MONTH;
        const wEnd = Math.min(wStart + WEEKS_PER_MONTH - 1, weekCursor + weeks - 1);
        items.push({
          monthNumber: monthNum,
          weekStart: wStart,
          weekEnd: wEnd,
          rxId: med.id,
          date: newest.createdAt,
          medName: med.medName,
          doseLabel: fmtDose(dose),
          source: 'vial-volume-estimator',
          isTitration: m === 0 ? isTitration : false,
          isSameDose: m === 0 ? isSameDose : true,
        });
      }
      weekCursor += weeks;
    }
  }
  return { items, sourceOrderId: newest.id };
}

function printScheduleTable(label: string, items: ScheduleItem[], now: Date) {
  console.log(`${label} (${items.length} items)`);
  if (items.length === 0) {
    console.log('  (empty)');
    return;
  }
  for (const it of items) {
    const periodStart = new Date(it.date);
    periodStart.setDate(periodStart.getDate() + (it.weekStart - 1) * 7);
    const periodEnd = new Date(it.date);
    periodEnd.setDate(periodEnd.getDate() + it.weekEnd * 7);
    const isCurrent = now >= periodStart && now < periodEnd;
    const isPast = now >= periodEnd;
    const flags = [
      isCurrent ? 'CURRENT' : '',
      isPast ? 'past' : '',
      it.isTitration ? 'titration' : '',
      it.isSameDose ? 'same-dose' : '',
    ]
      .filter(Boolean)
      .join(',');
    console.log(
      `  Month ${it.monthNumber.toString().padStart(2)} weeks ${it.weekStart}-${it.weekEnd} ` +
        `dose=${it.doseLabel.padEnd(14)} src=${it.source.padEnd(22)} ` +
        `[${flags}] rxId=${it.rxId} prescribed=${it.date.toISOString().slice(0, 10)}`
    );
  }
}

async function diagPatient(publicPatientId: string, now: Date): Promise<void> {
  hr(`Patient ${publicPatientId}`);

  const patient = await basePrisma.patient.findFirst({
    where: { patientId: publicPatientId },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      createdAt: true,
    },
  });
  if (!patient) {
    console.log(`No Patient row with patientId="${publicPatientId}".`);
    return;
  }
  console.log(
    `internal id=${patient.id} clinicId=${patient.clinicId} created=${patient.createdAt.toISOString()}`
  );

  const orders = await basePrisma.order.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      rxs: {
        select: {
          id: true,
          medName: true,
          strength: true,
          form: true,
          quantity: true,
          sig: true,
          daysSupply: true,
        },
      },
    },
  });

  if (orders.length === 0) {
    console.log('No orders.');
    return;
  }

  hr(`Raw orders (newest first), ${orders.length} total`);
  for (const order of orders) {
    console.log(
      `Order #${order.id} status=${order.status ?? 'null'} createdAt=${order.createdAt.toISOString()}`
    );
    if (order.rxs.length === 0) {
      console.log('  (no Rx rows)');
      continue;
    }
    for (const rx of order.rxs) {
      console.log(
        `  rxId=${rx.id} medName="${rx.medName}" qty="${rx.quantity ?? ''}" ` +
          `daysSupply=${rx.daysSupply} strength="${rx.strength ?? ''}" form="${rx.form ?? ''}"`
      );
      console.log(`    sig: ${JSON.stringify(rx.sig)}`);
      const multi = parseMultiMonthDirections(rx.sig ?? '');
      if (multi) {
        console.log(`    parseMultiMonthDirections -> ${multi.length} segments:`);
        for (const seg of multi) {
          console.log(
            `      Month ${seg.monthNumber}: dose=${fmtDose(seg.dose)} weeks=${seg.weeks}`
          );
        }
      } else {
        const single = parseDoseFromDirections(rx.sig ?? '');
        console.log(
          `    parseMultiMonthDirections -> null (no Month N: tags); parseDoseFromDirections -> ${fmtDose(single)}`
        );
      }
    }
  }

  hr('CURRENT (buggy) "stack every Rx sequentially" schedule');
  printScheduleTable('legacy', buildLegacyStackedSchedule(orders), now);

  hr('NEW "newest Rx wins globally" schedule');
  const newest = buildNewestWinsSchedule(orders);
  console.log(`Source order: ${newest.sourceOrderId ?? 'null'}`);
  printScheduleTable('newest-wins', newest.items, now);
}

async function main(): Promise<void> {
  const ids = getArgs('patientId');
  if (ids.length === 0) {
    console.error(
      'Usage: tsx scripts/diag-patient-dose-schedule.ts --patientId WEL-78965020 [--patientId WEL-78934042 ...]'
    );
    process.exitCode = 1;
    return;
  }
  const now = new Date();
  console.log(`Reference "now" = ${now.toISOString()}`);
  for (const id of ids) {
    await diagPatient(id, now);
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => basePrisma.$disconnect());
