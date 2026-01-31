/**
 * Check for suspicious invoice amounts that might be affected by the cents/dollars bug
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find wellmedr clinic
  const clinic = await prisma.clinic.findFirst({
    where: { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
    select: { id: true, name: true }
  });
  
  if (!clinic) {
    console.log('Wellmedr clinic not found');
    return;
  }
  console.log('Clinic:', clinic.id, clinic.name);
  
  // Find invoices that might be affected (amount between 100 and 10000 = $1 to $100)
  // These are likely wrong because GLP-1 meds typically cost $200-$2000
  const suspicious = await prisma.invoice.findMany({
    where: {
      clinicId: clinic.id,
      amount: { gte: 100, lte: 10000 },
      status: 'PAID'
    },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  
  console.log('\nSuspicious invoices (amount $1-$100 for GLP-1):');
  console.log('(These amounts are likely wrong - should be 100x higher)');
  console.log('-'.repeat(80));
  
  for (const inv of suspicious) {
    const dollars = ((inv.amount || 0) / 100).toFixed(2);
    const likelyCorrect = (((inv.amount || 0) * 100) / 100).toFixed(2);
    console.log(`ID: ${inv.id}`);
    console.log(`  Amount: $${dollars} (likely should be $${likelyCorrect})`);
    console.log(`  Patient: ${inv.patient?.firstName} ${inv.patient?.lastName}`);
    console.log(`  Email: ${inv.patient?.email}`);
    console.log(`  Date: ${inv.createdAt.toISOString().split('T')[0]}`);
    console.log('');
  }
  
  if (suspicious.length === 0) {
    console.log('No suspicious invoices found in this range.');
  }
  
  // Also check for very recent invoices to see what amounts look like
  const recent = await prisma.invoice.findMany({
    where: { clinicId: clinic.id, status: 'PAID' },
    include: { patient: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('Recent 10 paid invoices (for comparison):');
  console.log('-'.repeat(80));
  
  for (const inv of recent) {
    const amount = (inv.amount || 0) / 100;
    console.log(`ID: ${inv.id} | $${amount.toFixed(2)} | ${inv.patient?.firstName} ${inv.patient?.lastName} | ${inv.createdAt.toISOString().split('T')[0]}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
