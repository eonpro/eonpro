/**
 * Diagnostic Script: Find Patient Users with Missing patientId
 *
 * Finds all User records with role='PATIENT' where patientId is null,
 * meaning the User is not linked to a Patient record.
 *
 * Usage: npx tsx scripts/find-unlinked-patient-users.ts [--fix]
 *
 * Without --fix: reports unlinked users (dry run)
 * With --fix: attempts to resolve and link each user to their Patient record
 */

import { PrismaClient } from '@prisma/client';
import { resolvePatientId } from '../src/lib/auth/resolve-patient-id';

const prisma = new PrismaClient();

async function main() {
  const shouldFix = process.argv.includes('--fix');

  console.log('Finding Patient users with null patientId...\n');

  const unlinkedUsers = await prisma.user.findMany({
    where: {
      role: 'PATIENT',
      patientId: null,
    },
    select: {
      id: true,
      email: true,
      clinicId: true,
      createdAt: true,
      lastLogin: true,
    },
    orderBy: { lastLogin: 'desc' },
  });

  console.log(`Found ${unlinkedUsers.length} unlinked patient users.\n`);

  if (unlinkedUsers.length === 0) {
    console.log('All patient users are properly linked.');
    return;
  }

  for (const user of unlinkedUsers) {
    const lastLogin = user.lastLogin
      ? user.lastLogin.toISOString().split('T')[0]
      : 'never';
    console.log(
      `  User #${user.id} | ${user.email} | clinic=${user.clinicId ?? 'none'} | ` +
      `created=${user.createdAt.toISOString().split('T')[0]} | lastLogin=${lastLogin}`
    );

    if (shouldFix) {
      const resolved = await resolvePatientId({
        id: user.id,
        email: user.email,
        clinicId: user.clinicId ?? undefined,
      });
      if (resolved) {
        console.log(`    ✓ Linked to Patient #${resolved}`);
      } else {
        console.log(`    ✗ No matching Patient found`);
      }
    }
  }

  if (!shouldFix && unlinkedUsers.length > 0) {
    console.log('\nRun with --fix to attempt automatic linking:');
    console.log('  npx tsx scripts/find-unlinked-patient-users.ts --fix');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
