/**
 * Link User to Provider Script
 * =============================
 * 
 * This script helps diagnose and fix user-provider linking issues.
 * When a user can't approve SOAP notes, it's usually because their
 * User record isn't linked to their Provider record.
 * 
 * Usage:
 *   npx ts-node scripts/link-user-to-provider.ts <user-email>
 *   npx ts-node scripts/link-user-to-provider.ts <user-email> --fix
 * 
 * Example:
 *   npx ts-node scripts/link-user-to-provider.ts gavin@example.com
 *   npx ts-node scripts/link-user-to-provider.ts gavin@example.com --fix
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const shouldFix = args.includes('--fix');

  if (!email) {
    console.log('Usage: npx ts-node scripts/link-user-to-provider.ts <user-email> [--fix]');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/link-user-to-provider.ts gavin@example.com');
    console.log('  npx ts-node scripts/link-user-to-provider.ts gavin@example.com --fix');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up user: ${email}\n`);

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      provider: true,
    },
  });

  if (!user) {
    console.log(`❌ User not found with email: ${email}`);
    
    // Try to find by partial match
    const partialMatches = await prisma.user.findMany({
      where: {
        email: {
          contains: email.split('@')[0],
          mode: 'insensitive',
        },
      },
      take: 5,
    });
    
    if (partialMatches.length > 0) {
      console.log('\n📋 Did you mean one of these?');
      partialMatches.forEach(u => console.log(`   - ${u.email} (ID: ${u.id})`));
    }
    
    process.exit(1);
  }

  console.log('✅ User found:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Name: ${user.firstName || '(not set)'} ${user.lastName || '(not set)'}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   Provider ID: ${user.providerId || '(not linked)'}`);

  if (user.provider) {
    console.log('\n✅ User is already linked to provider:');
    console.log(`   Provider ID: ${user.provider.id}`);
    console.log(`   Provider Name: ${user.provider.firstName} ${user.provider.lastName}`);
    console.log(`   Provider Email: ${user.provider.email || '(not set)'}`);
    return;
  }

  console.log('\n⚠️  User is NOT linked to any provider\n');

  // Search for potential provider matches
  console.log('🔍 Searching for matching providers...\n');

  // Strategy 1: Email match
  const providerByEmail = await prisma.provider.findFirst({
    where: { email: user.email.toLowerCase() },
  });

  if (providerByEmail) {
    console.log('📧 Found provider by email match:');
    console.log(`   ID: ${providerByEmail.id}`);
    console.log(`   Name: ${providerByEmail.firstName} ${providerByEmail.lastName}`);
    console.log(`   Email: ${providerByEmail.email}`);
    
    if (shouldFix) {
      await prisma.user.update({
        where: { id: user.id },
        data: { providerId: providerByEmail.id },
      });
      console.log('\n✅ User linked to provider via email match!');
      return;
    } else {
      console.log('\n💡 Run with --fix to link this user to the provider');
      return;
    }
  }

  // Strategy 2: Name match
  if (user.firstName && user.lastName) {
    const providerByName = await prisma.provider.findFirst({
      where: {
        firstName: { equals: user.firstName, mode: 'insensitive' },
        lastName: { equals: user.lastName, mode: 'insensitive' },
      },
    });

    if (providerByName) {
      console.log('👤 Found provider by name match:');
      console.log(`   ID: ${providerByName.id}`);
      console.log(`   Name: ${providerByName.firstName} ${providerByName.lastName}`);
      console.log(`   Email: ${providerByName.email || '(not set)'}`);
      
      if (shouldFix) {
        await prisma.user.update({
          where: { id: user.id },
          data: { providerId: providerByName.id },
        });
        console.log('\n✅ User linked to provider via name match!');
        return;
      } else {
        console.log('\n💡 Run with --fix to link this user to the provider');
        return;
      }
    }
  }

  // No automatic match found - show all providers
  console.log('❌ No automatic match found\n');
  
  // List similar providers by name
  const nameParts = [user.firstName, user.lastName].filter(Boolean);
  if (nameParts.length > 0) {
    const similarProviders = await prisma.provider.findMany({
      where: {
        OR: nameParts.map(part => ({
          OR: [
            { firstName: { contains: part as string, mode: 'insensitive' as const } },
            { lastName: { contains: part as string, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 10,
    });

    if (similarProviders.length > 0) {
      console.log('📋 Similar providers found:');
      similarProviders.forEach(p => {
        console.log(`   - ID ${p.id}: ${p.firstName} ${p.lastName} (${p.email || 'no email'})`);
      });
      console.log('\n💡 To manually link, run:');
      console.log(`   npx prisma db execute --stdin <<< "UPDATE \\"User\\" SET \\"providerId\\" = <PROVIDER_ID> WHERE id = ${user.id};"`)
    }
  }

  // Show all providers if user wants
  const allProviderCount = await prisma.provider.count();
  console.log(`\n📊 Total providers in database: ${allProviderCount}`);
  console.log('   Run with a more specific search or check the providers table directly.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
