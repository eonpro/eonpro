/**
 * Script to add performance indexes to the database
 * Run with: npx ts-node scripts/add-indexes.ts
 */

import { PrismaClient } from '@prisma/client';

import { logger } from '../src/lib/logger';

const prisma = new PrismaClient();

async function addIndexes() {
  logger.info('Adding performance indexes to the database...');
  
  const indexes = [
    // Patient table indexes
    'CREATE INDEX IF NOT EXISTS "idx_patient_email" ON "Patient"("email")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_phone" ON "Patient"("phone")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_provider_id" ON "Patient"("providerId")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_created_at" ON "Patient"("createdAt" DESC)',
    
    // Order table indexes
    'CREATE INDEX IF NOT EXISTS "idx_order_patient_id" ON "Order"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_order_provider_id" ON "Order"("providerId")',
    'CREATE INDEX IF NOT EXISTS "idx_order_created_at" ON "Order"("createdAt" DESC)',
    'CREATE INDEX IF NOT EXISTS "idx_order_lifefile_order_id" ON "Order"("lifefileOrderId")',
    
    // Influencer table indexes
    'CREATE INDEX IF NOT EXISTS "idx_influencer_email" ON "Influencer"("email")',
    'CREATE INDEX IF NOT EXISTS "idx_influencer_is_active" ON "Influencer"("isActive")',
    
    // SOAPNote table indexes
    'CREATE INDEX IF NOT EXISTS "idx_soapnote_patient_id" ON "SOAPNote"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_soapnote_provider_id" ON "SOAPNote"("providerId")',
    'CREATE INDEX IF NOT EXISTS "idx_soapnote_created_at" ON "SOAPNote"("createdAt" DESC)',
    
    // PatientDocument table indexes
    'CREATE INDEX IF NOT EXISTS "idx_patient_document_patient_id" ON "PatientDocument"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_document_category" ON "PatientDocument"("category")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_document_created_at" ON "PatientDocument"("createdAt" DESC)',
    
    // Invoice table indexes
    'CREATE INDEX IF NOT EXISTS "idx_invoice_patient_id" ON "Invoice"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_invoice_status" ON "Invoice"("status")',
    'CREATE INDEX IF NOT EXISTS "idx_invoice_stripe_invoice_id" ON "Invoice"("stripeInvoiceId")',
    
    // Subscription table indexes
    'CREATE INDEX IF NOT EXISTS "idx_subscription_patient_id" ON "Subscription"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_subscription_status" ON "Subscription"("status")',
    'CREATE INDEX IF NOT EXISTS "idx_subscription_stripe_subscription_id" ON "Subscription"("stripeSubscriptionId")',
    
    // Payment table indexes
    'CREATE INDEX IF NOT EXISTS "idx_payment_patient_id" ON "Payment"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_payment_invoice_id" ON "Payment"("invoiceId")',
    'CREATE INDEX IF NOT EXISTS "idx_payment_stripe_payment_intent_id" ON "Payment"("stripePaymentIntentId")',
    
    // AssistantConversation indexes
    'CREATE INDEX IF NOT EXISTS "idx_assistant_conversation_user_email" ON "AssistantConversation"("userEmail")',
    'CREATE INDEX IF NOT EXISTS "idx_assistant_conversation_created_at" ON "AssistantConversation"("createdAt" DESC)',
    
    // Audit table indexes
    'CREATE INDEX IF NOT EXISTS "idx_patient_audit_patient_id" ON "PatientAudit"("patientId")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_audit_performed_by_email" ON "PatientAudit"("performedByEmail")',
    'CREATE INDEX IF NOT EXISTS "idx_patient_audit_created_at" ON "PatientAudit"("createdAt" DESC)',
    'CREATE INDEX IF NOT EXISTS "idx_provider_audit_provider_id" ON "ProviderAudit"("providerId")',
    'CREATE INDEX IF NOT EXISTS "idx_provider_audit_performed_by_email" ON "ProviderAudit"("performedByEmail")',
    'CREATE INDEX IF NOT EXISTS "idx_provider_audit_created_at" ON "ProviderAudit"("createdAt" DESC)',
  ];
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const indexSql of indexes) {
    try {
      await prisma.$executeRawUnsafe(indexSql);
      logger.info('✅ Added index:', indexSql.match(/"([^"]+)"/)?.[1]);
      successCount++;
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        logger.info('⏭️  Index already exists:', indexSql.match(/"([^"]+)"/)?.[1]);
      } else {
        logger.error('❌ Error adding index:', error.message);
        errorCount++;
      }
    }
  }
  
  logger.info('\n📊 Summary:');
  logger.info(`✅ Successfully added: ${successCount} indexes`);
  if (errorCount > 0) {
    logger.info(`❌ Errors: ${errorCount}`);
  }
  
  logger.info('\nAnalyzing database for optimization...');
  
  // Run ANALYZE to update database statistics
  try {
    await prisma.$executeRawUnsafe('ANALYZE');
    logger.info('✅ Database statistics updated');
  } catch (error) {
    logger.info('⚠️  Could not update database statistics (SQLite specific)');
  }
  
  // Show index usage statistics (SQLite specific)
  try {
    const indexList = await prisma.$queryRawUnsafe(`
      SELECT name, tbl_name
      FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_%'
      ORDER BY tbl_name, name
    `) as any[];
    
    logger.info('\n📋 Custom indexes in database:');
    let currentTable = '';
    for (const idx of indexList) {
      if (idx.tbl_name !== currentTable) {
        currentTable = idx.tbl_name;
        logger.info(`\n  ${currentTable}:`);
      }
      logger.info(`    - ${idx.name}`);
    }
  } catch (error) {
    logger.info('⚠️  Could not fetch index list');
  }
}

addIndexes()
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
