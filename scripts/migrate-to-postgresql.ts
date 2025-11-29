#!/usr/bin/env node

/**
 * Database Migration Script: SQLite to PostgreSQL
 * 
 * This script safely migrates all data from SQLite to PostgreSQL
 * while preserving relationships and data integrity.
 */

import { PrismaClient as SqliteClient } from '@prisma/client';
import { logger } from '../src/lib/logger';

import { PrismaClient as PostgresClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Initialize clients
const sqliteDb = new SqliteClient({
  datasources: {
    db: {
      url: process.env.SQLITE_DATABASE_URL || 'file:./prisma/dev.db'
    }
  }
});

const postgresDb = new PostgresClient({
  datasources: {
    db: {
      url: process.env.POSTGRESQL_DATABASE_URL || process.env.DATABASE_URL
    }
  }
});

// Migration progress tracker
class MigrationTracker {
  private progress: Map<string, number> = new Map();
  private errors: Array<{ table: string; error: string }> = [];

  log(message: string) {
    logger.info(`[${new Date().toISOString()}] ${message}`);
  }

  setProgress(table: string, current: number, total: number) {
    this.progress.set(table, (current / total) * 100);
    this.log(`${table}: ${current}/${total} (${Math.round((current / total) * 100)}%)`);
  }

  addError(table: string, error: string) {
    this.errors.push({ table, error });
    logger.error(`ERROR in ${table}: ${error}`);
  }

  summary() {
    logger.info('\n=== Migration Summary ===');
    this.progress.forEach((percent, table) => {
      logger.info(`${table}: ${Math.round(percent)}% complete`);
    });
    
    if (this.errors.length > 0) {
      logger.info('\n=== Errors ===');
      this.errors.forEach(({ table, error }) => {
        logger.info(`${table}: ${error}`);
      });
    }
  }
}

const tracker = new MigrationTracker();

// Batch processing for large tables
async function migrateInBatches<T>(
  tableName: string,
  fetchFn: (skip: number, take: number) => Promise<T[]>,
  insertFn: (data: T[]) => Promise<void>,
  batchSize: number = 100
) {
  tracker.log(`Starting migration for ${tableName}...`);
  
  let skip = 0;
  let totalProcessed = 0;
  let hasMore = true;

  // Get total count
  const countFn = (sqliteDb as any)[tableName.charAt(0).toLowerCase() + tableName.slice(1)].count;
  const totalCount = await countFn();
  
  while (hasMore) {
    try {
      const batch = await fetchFn(skip, batchSize);
      
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      await insertFn(batch);
      totalProcessed += batch.length;
      skip += batchSize;
      
      tracker.setProgress(tableName, totalProcessed, totalCount);
      
      if (batch.length < batchSize) {
        hasMore = false;
      }
    } catch (error) {
      tracker.addError(tableName, (error as Error).message);
      throw error;
    }
  }
  
  tracker.log(`✅ Completed ${tableName}: ${totalProcessed} records migrated`);
}

// Main migration function
async function migrate() {
  tracker.log('🚀 Starting database migration from SQLite to PostgreSQL...');
  
  try {
    // Test connections
    await sqliteDb.$connect();
    tracker.log('✅ Connected to SQLite database');
    
    await postgresDb.$connect();
    tracker.log('✅ Connected to PostgreSQL database');

    // Clear PostgreSQL database (optional - comment out if appending data)
    if (process.env.CLEAR_TARGET_DB === 'true') {
      tracker.log('⚠️ Clearing target PostgreSQL database...');
      await postgresDb.$executeRaw`TRUNCATE TABLE "Patient", "Provider", "Order", "Rx", "PatientDocument", "PatientCounter", "OrderEvent", "ProviderAudit", "PatientAudit", "Invoice", "Payment", "PaymentMethod", "SOAPNote", "SOAPNoteRevision", "AIConversation", "AIMessage", "Subscription", "Influencer", "InfluencerBankAccount", "ReferralTracking", "Commission", "CommissionPayout" CASCADE`;
    }

    // Migrate in dependency order
    
    // 1. Independent tables first
    await migrateInBatches('Patient', 
      async (skip, take) => await sqliteDb.patient.findMany({ skip, take }),
      async (data) => await postgresDb.patient.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Provider',
      async (skip, take) => await sqliteDb.provider.findMany({ skip, take }),
      async (data) => await postgresDb.provider.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Influencer',
      async (skip, take) => await sqliteDb.influencer.findMany({ skip, take }),
      async (data) => await postgresDb.influencer.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('PatientCounter',
      async (skip, take) => await sqliteDb.patientCounter.findMany({ skip, take }),
      async (data) => await postgresDb.patientCounter.createMany({ data, skipDuplicates: true })
    );

    // 2. Tables with foreign keys
    await migrateInBatches('Order',
      async (skip, take) => await sqliteDb.order.findMany({ skip, take }),
      async (data) => await postgresDb.order.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('PatientDocument',
      async (skip, take) => await sqliteDb.patientDocument.findMany({ skip, take }),
      async (data) => await postgresDb.patientDocument.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Invoice',
      async (skip, take) => await sqliteDb.invoice.findMany({ skip, take }),
      async (data) => await postgresDb.invoice.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('PaymentMethod',
      async (skip, take) => await sqliteDb.paymentMethod.findMany({ skip, take }),
      async (data) => await postgresDb.paymentMethod.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Subscription',
      async (skip, take) => await sqliteDb.subscription.findMany({ skip, take }),
      async (data) => await postgresDb.subscription.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('AIConversation',
      async (skip, take) => await sqliteDb.aIConversation.findMany({ skip, take }),
      async (data) => await postgresDb.aIConversation.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('ReferralTracking',
      async (skip, take) => await sqliteDb.referralTracking.findMany({ skip, take }),
      async (data) => await postgresDb.referralTracking.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('InfluencerBankAccount',
      async (skip, take) => await sqliteDb.influencerBankAccount.findMany({ skip, take }),
      async (data) => await postgresDb.influencerBankAccount.createMany({ data, skipDuplicates: true })
    );

    // 3. Tables with multiple foreign keys
    await migrateInBatches('Rx',
      async (skip, take) => await sqliteDb.rx.findMany({ skip, take }),
      async (data) => await postgresDb.rx.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('OrderEvent',
      async (skip, take) => await sqliteDb.orderEvent.findMany({ skip, take }),
      async (data) => await postgresDb.orderEvent.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('ProviderAudit',
      async (skip, take) => await sqliteDb.providerAudit.findMany({ skip, take }),
      async (data) => await postgresDb.providerAudit.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('PatientAudit',
      async (skip, take) => await sqliteDb.patientAudit.findMany({ skip, take }),
      async (data) => await postgresDb.patientAudit.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Payment',
      async (skip, take) => await sqliteDb.payment.findMany({ skip, take }),
      async (data) => await postgresDb.payment.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('SOAPNote',
      async (skip, take) => await sqliteDb.sOAPNote.findMany({ skip, take }),
      async (data) => await postgresDb.sOAPNote.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('SOAPNoteRevision',
      async (skip, take) => await sqliteDb.sOAPNoteRevision.findMany({ skip, take }),
      async (data) => await postgresDb.sOAPNoteRevision.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('AIMessage',
      async (skip, take) => await sqliteDb.aIMessage.findMany({ skip, take }),
      async (data) => await postgresDb.aIMessage.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('Commission',
      async (skip, take) => await sqliteDb.commission.findMany({ skip, take }),
      async (data) => await postgresDb.commission.createMany({ data, skipDuplicates: true })
    );

    await migrateInBatches('CommissionPayout',
      async (skip, take) => await sqliteDb.commissionPayout.findMany({ skip, take }),
      async (data) => await postgresDb.commissionPayout.createMany({ data, skipDuplicates: true })
    );

    // Reset sequences for PostgreSQL
    tracker.log('🔄 Resetting PostgreSQL sequences...');
    await postgresDb.$executeRaw`SELECT setval(pg_get_serial_sequence('"Patient"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "Patient"`;
    await postgresDb.$executeRaw`SELECT setval(pg_get_serial_sequence('"Provider"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "Provider"`;
    await postgresDb.$executeRaw`SELECT setval(pg_get_serial_sequence('"Order"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "Order"`;
    // Add more sequence resets as needed...

    tracker.log('✅ Migration completed successfully!');
    tracker.summary();

  } catch (error) {
    tracker.log(`❌ Migration failed: ${(error as Error).message}`);
    tracker.summary();
    process.exit(1);
  } finally {
    await sqliteDb.$disconnect();
    await postgresDb.$disconnect();
  }
}

// Verification function
async function verify() {
  tracker.log('🔍 Verifying migration...');
  
  const tables = [
    'patient', 'provider', 'order', 'rx', 'patientDocument', 
    'invoice', 'payment', 'sOAPNote', 'subscription', 'influencer'
  ];
  
  for (const table of tables) {
    const sqliteCount = await (sqliteDb as any)[table].count();
    const postgresCount = await (postgresDb as any)[table].count();
    
    if (sqliteCount === postgresCount) {
      tracker.log(`✅ ${table}: ${sqliteCount} records match`);
    } else {
      tracker.log(`⚠️ ${table}: SQLite has ${sqliteCount}, PostgreSQL has ${postgresCount}`);
    }
  }
}

// Run migration
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'verify') {
    verify().catch(console.error);
  } else {
    migrate().catch(console.error);
  }
}
