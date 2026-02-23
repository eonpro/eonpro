/**
 * Find orders by date (and clinic) or by referenceId. Use to locate "missing" prescriptions.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/find-order-by-date-or-reference.ts --clinic eonmeds --date 2026-02-19
 *   DATABASE_URL=... npx tsx scripts/find-order-by-date-or-reference.ts --referenceId 100929833
 *   DATABASE_URL=... npx tsx scripts/find-order-by-date-or-reference.ts --clinic eonmeds --date 2026-02-19 --dob 06/25/92
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const clinicSub = getArg('--clinic');
  const dateStr = getArg('--date'); // YYYY-MM-DD
  const referenceId = getArg('--referenceId');
  const dob = getArg('--dob'); // MM/DD/YY or MM/DD/YYYY

  if (referenceId) {
    const orders = await prisma.order.findMany({
      where: { referenceId },
      include: {
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true, dob: true, searchIndex: true } },
        clinic: { select: { id: true, subdomain: true, name: true } },
      },
    });
    console.log(JSON.stringify({ by: 'referenceId', value: referenceId, count: orders.length }, null, 2));
    orders.forEach((o) => {
      console.log(JSON.stringify({
        orderId: o.id,
        referenceId: o.referenceId,
        messageId: o.messageId,
        status: o.status,
        createdAt: o.createdAt,
        patientId: o.patientId,
        patientPatientId: o.patient.patientId,
        clinic: o.clinic?.subdomain,
      }, null, 2));
    });
    return;
  }

  let clinicId: number | undefined;
  if (clinicSub) {
    const c = await prisma.clinic.findUnique({ where: { subdomain: clinicSub }, select: { id: true } });
    if (!c) {
      console.error('Clinic not found:', clinicSub);
      process.exit(1);
    }
    clinicId = c.id;
  }

  const where: Record<string, unknown> = {};
  if (clinicId) where.clinicId = clinicId;
  if (dateStr) {
    const d = new Date(dateStr);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    where.createdAt = { gte: d, lt: next };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      patient: { select: { id: true, patientId: true, firstName: true, lastName: true, dob: true } },
      clinic: { select: { id: true, subdomain: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  let filtered = orders;
  if (dob) {
    const norm = dob.replace(/\//g, '');
    filtered = orders.filter((o) => {
      const pd = (o.patient.dob || '').replace(/\D/g, '');
      return pd.includes(norm) || norm.includes(pd);
    });
  }

  console.log(JSON.stringify({
    by: 'date',
    date: dateStr,
    clinic: clinicSub,
    dobFilter: dob || null,
    totalOrders: orders.length,
    afterDobFilter: filtered.length,
  }, null, 2));

  filtered.forEach((o) => {
    console.log(JSON.stringify({
      orderId: o.id,
      referenceId: o.referenceId,
      status: o.status,
      createdAt: o.createdAt,
      patientId: o.patient.id,
      patientPatientId: o.patient.patientId,
      clinic: o.clinic?.subdomain,
    }, null, 2));
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
