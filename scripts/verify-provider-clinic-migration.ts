/**
 * Verify ProviderClinic migration was successful
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verifying ProviderClinic migration...\n');

  // Count providers
  const providerCount = await prisma.provider.count();
  console.log(`Total providers: ${providerCount}`);

  // Count ProviderClinic assignments
  const assignmentCount = await prisma.providerClinic.count();
  console.log(`Total ProviderClinic assignments: ${assignmentCount}`);

  // Count providers with clinicId set
  const providersWithClinic = await prisma.provider.count({
    where: { clinicId: { not: null } }
  });
  console.log(`Providers with direct clinicId: ${providersWithClinic}`);

  // Count providers with primaryClinicId set
  const providersWithPrimary = await prisma.provider.count({
    where: { primaryClinicId: { not: null } }
  });
  console.log(`Providers with primaryClinicId set: ${providersWithPrimary}`);

  // Sample ProviderClinic entries
  const sampleAssignments = await prisma.providerClinic.findMany({
    take: 5,
    include: {
      provider: { select: { firstName: true, lastName: true } },
      clinic: { select: { name: true } }
    }
  });

  if (sampleAssignments.length > 0) {
    console.log('\nSample ProviderClinic assignments:');
    for (const a of sampleAssignments) {
      console.log(`  - ${a.provider.firstName} ${a.provider.lastName} -> ${a.clinic.name} (primary: ${a.isPrimary})`);
    }
  }

  console.log('\n✅ Migration verification complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
