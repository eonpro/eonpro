#!/usr/bin/env npx tsx
/**
 * Find a patient in the database by name
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SEARCH_NAME = process.argv[2] || 'Carson Jones';

async function main() {
  console.log(`\nSearching for "${SEARCH_NAME}" in database...\n`);
  
  const nameParts = SEARCH_NAME.toLowerCase().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  // Search by name (case-insensitive, partial match)
  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { firstName: { contains: firstName, mode: 'insensitive' } },
        { lastName: { contains: lastName || firstName, mode: 'insensitive' } },
        { email: { contains: firstName, mode: 'insensitive' } },
      ],
    },
    include: {
      clinic: { select: { name: true, subdomain: true } },
    },
    take: 20,
  });
  
  if (patients.length === 0) {
    console.log('No patients found matching that name.');
    return;
  }
  
  console.log(`Found ${patients.length} patient(s):\n`);
  
  for (const p of patients) {
    console.log('='.repeat(60));
    console.log(`ID: ${p.id}`);
    console.log(`Patient ID: ${p.patientId}`);
    console.log(`Name: ${p.firstName} ${p.lastName}`);
    console.log(`Email: ${p.email}`);
    console.log(`Phone: ${p.phone}`);
    console.log(`DOB: ${p.dob}`);
    console.log(`Address: ${p.address1}, ${p.city}, ${p.state} ${p.zip}`);
    console.log(`Clinic: ${p.clinic?.name} (${p.clinic?.subdomain})`);
    console.log(`Created: ${p.createdAt}`);
    console.log(`Source: ${p.source}`);
    
    // Check if data looks encrypted
    const looksEncrypted = (val: string | null) => {
      if (!val) return false;
      const parts = val.split(':');
      return parts.length === 3 && parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part));
    };
    
    if (looksEncrypted(p.firstName) || looksEncrypted(p.lastName)) {
      console.log('\n⚠️  WARNING: This patient data appears to be ENCRYPTED');
      console.log('   The decryption may be failing due to key mismatch.');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
