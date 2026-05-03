#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { findPatientByEmail } from '../src/services/stripe/paymentMatchingService';

async function main() {
  const sub = process.argv[2] ?? 'sub_1TSnBXDfH4PWyxxdiW4eqpEn';
  const cust = process.argv[3] ?? 'cus_URgYAwm11JEWJk';
  const email = process.argv[4] ?? 'candyannedwards@gmail.com';

  await runWithClinicContext(7, async () => {
    console.log(`\nSearching for: cust=${cust} email=${email}`);

    const byCust = await prisma.patient.findFirst({
      where: { stripeCustomerId: cust },
      select: { id: true, clinicId: true },
    });
    console.log(`findFirst({stripeCustomerId}): ${JSON.stringify(byCust)}`);

    const byEmail = await findPatientByEmail(email, 7);
    console.log(`findPatientByEmail(scoped): ${byEmail ? `id=${byEmail.id} clinic=${byEmail.clinicId}` : 'null'}`);

    const byEmailUpper = await findPatientByEmail('Candyannedwards@gmail.com', 7);
    console.log(`findPatientByEmail(upper): ${byEmailUpper ? `id=${byEmailUpper.id}` : 'null'}`);

    // Check if any patient has this customerId already
    const owner = await prisma.patient.findUnique({
      where: { stripeCustomerId: cust },
      select: { id: true, clinicId: true },
    });
    console.log(`findUnique({stripeCustomerId}): ${JSON.stringify(owner)}`);
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
