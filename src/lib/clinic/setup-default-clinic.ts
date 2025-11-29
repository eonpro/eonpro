/**
 * Script to create a default clinic for existing data
 * Run this after adding multi-clinic support to migrate existing data
 */

import { prisma } from '@/lib/db';

import { logger } from '../logger';

export async function setupDefaultClinic() {
  try {
    // Check if default clinic already exists
    const existingClinic = await prisma.clinic.findFirst({
      where: { subdomain: 'main' }
    });

    if (existingClinic) {
      logger.info('Default clinic already exists:', existingClinic.name);
      return existingClinic;
    }

    // Create default clinic
    const defaultClinic = await prisma.clinic.create({
      data: {
        name: 'Main Clinic',
        subdomain: 'main',
        status: 'ACTIVE',
        adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
        billingPlan: 'enterprise',
        patientLimit: 10000,
        providerLimit: 100,
        storageLimit: 100000, // 100GB
        settings: {
          allowPatientRegistration: true,
          requireEmailVerification: true,
          enableTelehealth: true,
          enableEPrescribing: true,
        },
        features: {
          STRIPE_SUBSCRIPTIONS: true,
          TWILIO_SMS: true,
          TWILIO_CHAT: true,
          ZOOM_TELEHEALTH: true,
          AWS_S3: true,
          AI_SOAP_NOTES: true,
          INTERNAL_MESSAGING: true,
          TICKET_SYSTEM: true,
        },
        integrations: {},
        address: {
          address1: '123 Main St',
          city: 'New York',
          state: 'NY',
          zip: '10001',
          country: 'USA'
        },
        primaryColor: '#3B82F6',
        secondaryColor: '#10B981',
      }
    });

    logger.info('Created default clinic:', defaultClinic.name);

    // Update all existing records to belong to this clinic
    const clinicId = defaultClinic.id;

    // Update patients
    const patientsUpdated = await prisma.patient.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${patientsUpdated.count} patients`);

    // Update providers
    const providersUpdated = await prisma.provider.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${providersUpdated.count} providers`);

    // Update users
    const usersUpdated = await prisma.user.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${usersUpdated.count} users`);

    // Update orders
    const ordersUpdated = await prisma.order.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${ordersUpdated.count} orders`);

    // Update invoices
    const invoicesUpdated = await prisma.invoice.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${invoicesUpdated.count} invoices`);

    // Update tickets
    const ticketsUpdated = await prisma.ticket.updateMany({
      where: { clinicId: null },
      data: { clinicId }
    });
    logger.info(`Updated ${ticketsUpdated.count} tickets`);

    // Update other models as needed...
    
    logger.info('✅ Successfully migrated all data to default clinic');
    
    return defaultClinic;
  } catch (error) {
    logger.error('Error setting up default clinic:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  setupDefaultClinic()
    .then(() => {
      logger.info('Setup completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Setup failed:', error);
      process.exit(1);
    });
}
