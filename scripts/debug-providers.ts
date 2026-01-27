/**
 * Debug script to trace provider listing issues
 * 
 * To run against production:
 *   DATABASE_URL="your-production-url" npx tsx scripts/debug-providers.ts
 * 
 * Or run locally:
 *   npx tsx scripts/debug-providers.ts
 */

import { PrismaClient } from '@prisma/client';

console.log('Using DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');

const prisma = new PrismaClient();

async function main() {
  console.log('\n========== PROVIDER DEBUG ANALYSIS ==========\n');

  // 0. List all clinics first
  const allClinics = await prisma.clinic.findMany({
    select: { id: true, name: true, subdomain: true },
    orderBy: { id: 'asc' },
  });
  console.log(`📋 All Clinics (${allClinics.length}):`);
  for (const c of allClinics) {
    console.log(`   ID=${c.id}: "${c.name}" (${c.subdomain})`);
  }

  // 1. Get EONMeds clinic ID
  const eonmeds = await prisma.clinic.findFirst({
    where: { name: { contains: 'EONMeds', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  
  if (!eonmeds) {
    console.log('\n❌ EONMeds clinic not found - trying first clinic');
    const firstClinic = allClinics[0];
    if (!firstClinic) {
      console.log('No clinics in database!');
      return;
    }
    console.log(`Using clinic: ${firstClinic.name} (ID: ${firstClinic.id})`);
    // Continue with first clinic for local testing
  } else {
    console.log(`\n✅ EONMeds Clinic: ID=${eonmeds.id}, Name="${eonmeds.name}"`);
  }
  
  const targetClinicId = eonmeds?.id || allClinics[0]?.id;
  if (!targetClinicId) return;

  // 2. List all providers
  const allProviders = await prisma.provider.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      npi: true,
      clinicId: true,
      user: {
        select: {
          id: true,
          email: true,
          clinicId: true,
          userClinics: {
            select: {
              clinicId: true,
              role: true,
              isActive: true,
            },
          },
        },
      },
      providerClinics: {
        select: {
          clinicId: true,
          isPrimary: true,
          isActive: true,
          clinic: { select: { name: true } },
        },
      },
    },
  });

  console.log(`\n📋 Total Providers in Database: ${allProviders.length}\n`);

  for (const p of allProviders) {
    console.log(`\n--- Provider: ${p.firstName} ${p.lastName} (ID: ${p.id}) ---`);
    console.log(`    NPI: ${p.npi}`);
    console.log(`    Legacy clinicId: ${p.clinicId}`);
    
    if (p.user) {
      console.log(`    ✅ Linked to User ID: ${p.user.id} (${p.user.email})`);
      console.log(`       User's clinicId: ${p.user.clinicId}`);
      console.log(`       UserClinics: ${JSON.stringify(p.user.userClinics)}`);
    } else {
      console.log(`    ❌ NOT linked to any User`);
    }
    
    if (p.providerClinics.length > 0) {
      console.log(`    ProviderClinics (${p.providerClinics.length}):`);
      for (const pc of p.providerClinics) {
        console.log(`       - ${pc.clinic.name} (ID: ${pc.clinicId}) primary=${pc.isPrimary} active=${pc.isActive}`);
      }
    } else {
      console.log(`    ❌ No ProviderClinic entries`);
    }

    // Check if this provider would appear for target clinic
    const wouldAppearForClinic = 
      p.clinicId === targetClinicId ||
      p.providerClinics.some(pc => pc.clinicId === targetClinicId && pc.isActive) ||
      (p.user?.userClinics?.some(uc => uc.clinicId === targetClinicId && uc.isActive && uc.role === 'PROVIDER'));
    
    console.log(`    Would appear for target clinic: ${wouldAppearForClinic ? '✅ YES' : '❌ NO'}`);
  }

  // 3. List users with PROVIDER role in target clinic (via UserClinic)
  console.log('\n\n========== USERS WITH PROVIDER ROLE IN TARGET CLINIC ==========\n');
  
  const usersWithProviderRole = await prisma.userClinic.findMany({
    where: {
      clinicId: targetClinicId,
      role: 'PROVIDER',
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          providerId: true,
        },
      },
    },
  });

  console.log(`Found ${usersWithProviderRole.length} users with PROVIDER role in target clinic:\n`);
  
  for (const uc of usersWithProviderRole) {
    console.log(`- ${uc.user.firstName} ${uc.user.lastName} (User ID: ${uc.user.id})`);
    console.log(`  Email: ${uc.user.email}`);
    console.log(`  Linked providerId: ${uc.user.providerId ?? '❌ NONE'}`);
    
    if (uc.user.providerId) {
      const provider = await prisma.provider.findUnique({
        where: { id: uc.user.providerId },
        select: { id: true, firstName: true, lastName: true, npi: true },
      });
      if (provider) {
        console.log(`  ✅ Provider record: ${provider.firstName} ${provider.lastName} (NPI: ${provider.npi})`);
      } else {
        console.log(`  ❌ Provider record NOT FOUND for providerId ${uc.user.providerId}`);
      }
    } else {
      console.log(`  ❌ User has PROVIDER role but NO Provider record linked!`);
    }
    console.log('');
  }

  // 4. Check Italo's user record
  console.log('\n\n========== CHECKING ITALO PIGNANO ==========\n');
  
  const italo = await prisma.user.findFirst({
    where: { email: { contains: 'italo', mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      clinicId: true,
      providerId: true,
      role: true,
      userClinics: {
        select: {
          clinicId: true,
          clinic: { select: { name: true } },
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (italo) {
    console.log(`User: ${italo.email}`);
    console.log(`Role: ${italo.role}`);
    console.log(`Primary clinicId: ${italo.clinicId}`);
    console.log(`Linked providerId: ${italo.providerId}`);
    console.log(`UserClinics:`);
    for (const uc of italo.userClinics) {
      console.log(`  - ${uc.clinic.name} (ID: ${uc.clinicId}) role=${uc.role} active=${uc.isActive}`);
    }
  } else {
    console.log('❌ Italo user not found');
  }

  // 5. Simulate the actual query
  console.log('\n\n========== SIMULATING PROVIDER LIST QUERY FOR TARGET CLINIC ==========\n');
  
  const clinicIds = [targetClinicId];
  
  const queryResult = await prisma.provider.findMany({
    where: {
      OR: [
        // Condition 3: Via ProviderClinic
        {
          providerClinics: {
            some: {
              clinicId: { in: clinicIds },
              isActive: true,
            },
          },
        },
        // Condition 4: Legacy clinicId
        { clinicId: { in: clinicIds } },
        // Condition 5: Via User->UserClinic
        {
          user: {
            userClinics: {
              some: {
                clinicId: { in: clinicIds },
                isActive: true,
                role: 'PROVIDER',
              },
            },
          },
        },
        // Condition 6: Shared providers
        { clinicId: null },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      npi: true,
    },
  });

  console.log(`Query returned ${queryResult.length} providers:`);
  for (const p of queryResult) {
    console.log(`  - ${p.firstName} ${p.lastName} (ID: ${p.id}, NPI: ${p.npi})`);
  }

  console.log('\n========== DEBUG COMPLETE ==========\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
