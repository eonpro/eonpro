/**
 * Script to create a test admin user
 * Run: npx ts-node scripts/create-test-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Find or create EONMEDS clinic
    let clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { name: { contains: 'EONMEDS', mode: 'insensitive' } },
          { name: { contains: 'EON MEDS', mode: 'insensitive' } },
        ],
      },
    });

    if (!clinic) {
      console.log('Creating EONMEDS clinic...');
      clinic = await prisma.clinic.create({
        data: {
          name: 'EONMEDS',
          subdomain: 'eonmeds',
          adminEmail: 'italo@eonmeds.com',
          status: 'ACTIVE',
          settings: {},
          features: {},
          integrations: {},
        },
      });
      console.log('Created clinic:', clinic.id, clinic.name);
    } else {
      console.log('Found existing clinic:', clinic.id, clinic.name);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'italo@eonmeds.com' },
    });

    if (existingUser) {
      console.log('User already exists:', existingUser.id, existingUser.email);
      
      // Update phone number if needed
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          clinicId: clinic.id,
        },
      });
      console.log('Updated user clinicId');
      
      return;
    }

    // Hash password
    const password = 'EonMeds2024!';
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        email: 'italo@eonmeds.com',
        firstName: 'Italo',
        lastName: 'Pignano',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        clinicId: clinic.id,
      },
    });

    console.log('Created admin user:', user.id, user.email);

    // Create provider record with phone number
    const provider = await prisma.provider.create({
      data: {
        firstName: 'Italo',
        lastName: 'Pignano',
        email: 'italo@eonmeds.com',
        phone: '+18132637844',
        npi: 'PENDING_' + Date.now(),
        clinicId: clinic.id,
      },
    });

    console.log('Created provider with phone:', provider.id, provider.phone);

    // Link provider to user
    await prisma.user.update({
      where: { id: user.id },
      data: { providerId: provider.id },
    });

    console.log('\n✅ SUCCESS!');
    console.log('========================');
    console.log('Email: italo@eonmeds.com');
    console.log('Password: EonMeds2024!');
    console.log('Phone: +1(813) 263-7844');
    console.log('Clinic: EONMEDS');
    console.log('========================');
    console.log('\nYou can now login with email/password OR phone number (SMS OTP)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
