#!/usr/bin/env ts-node
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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

class DatabaseMigrator {
  private sqliteClient: SqliteClient;
  private postgresClient: PostgresClient;
  private startTime: number;
  private stats: {
    tables: string[];
    totalRecords: number;
    migratedRecords: number;
    errors: any[];
  };

  constructor() {
    // Initialize SQLite client with existing database
    this.sqliteClient = new SqliteClient({
      datasources: {
        db: {
          url: process.env.SQLITE_DATABASE_URL || 'file:./prisma/dev.db'
        }
      }
    });

    // Initialize PostgreSQL client
    this.postgresClient = new PostgresClient({
      datasources: {
        db: {
          url: process.env.POSTGRES_DATABASE_URL || 
               'postgresql://lifefile_user:lifefile_secure_password_2024@localhost:5432/lifefile_production'
        }
      }
    });

    this.startTime = Date.now();
    this.stats = {
      tables: [],
      totalRecords: 0,
      migratedRecords: 0,
      errors: []
    };
  }

  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const colorMap = {
      info: colors.cyan,
      success: colors.green,
      warning: colors.yellow,
      error: colors.red
    };
    logger.info(`${colorMap[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  private async createBackup() {
    this.log('Creating SQLite backup...', 'info');
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `lifefile-backup-${timestamp}.db`);
    
    fs.copyFileSync(
      path.join(process.cwd(), 'prisma', 'dev.db'),
      backupPath
    );

    this.log(`Backup created: ${backupPath}`, 'success');
    return backupPath;
  }

  private async setupPostgresSchema() {
    this.log('Setting up PostgreSQL schema...', 'info');
    
    try {
      // Run Prisma migrations
      await execAsync('npx prisma db push --skip-generate');
      this.log('PostgreSQL schema created successfully', 'success');
    } catch (error) {
      this.log(`Schema setup error: ${error}`, 'error');
      throw error;
    }
  }

  private async migrateTable(tableName: string, batchSize: number = 100) {
    this.log(`Migrating table: ${tableName}`, 'info');
    
    try {
      // Get total count
      const countResult = await (this.sqliteClient as any)[tableName].count();
      this.log(`  Found ${countResult} records in ${tableName}`, 'info');
      
      if (countResult === 0) {
        this.log(`  Skipping empty table: ${tableName}`, 'warning');
        return;
      }

      // Migrate in batches
      let offset = 0;
      let migratedCount = 0;

      while (offset < countResult) {
        const records = await (this.sqliteClient as any)[tableName].findMany({
          skip: offset,
          take: batchSize
        });

        if (records.length === 0) break;

        // Transform records if needed (handle date conversions, etc.)
        const transformedRecords = records.map((record: any) => {
          const transformed = { ...record };
          
          // Convert date strings to Date objects for PostgreSQL
          Object.keys(transformed).forEach(key => {
            if (key.includes('At') || key.includes('Date')) {
              if (transformed[key] && typeof transformed[key] === 'string') {
                transformed[key] = new Date(transformed[key]);
              }
            }
          });

          return transformed;
        });

        // Insert into PostgreSQL
        await (this.postgresClient as any)[tableName].createMany({
          data: transformedRecords,
          skipDuplicates: true
        });

        migratedCount += records.length;
        offset += batchSize;

        // Progress indicator
        const progress = Math.round((migratedCount / countResult) * 100);
        process.stdout.write(`\r  Progress: ${progress}% (${migratedCount}/${countResult})`);
      }

      process.stdout.write('\n');
      this.log(`  ✓ Migrated ${migratedCount} records from ${tableName}`, 'success');
      
      this.stats.tables.push(tableName);
      this.stats.totalRecords += countResult;
      this.stats.migratedRecords += migratedCount;

    } catch (error) {
      this.log(`  ✗ Error migrating ${tableName}: ${error}`, 'error');
      this.stats.errors.push({ table: tableName, error: error });
    }
  }

  private async verifyMigration() {
    this.log('Verifying migration...', 'info');
    
    const tables = [
      'patient', 'provider', 'order', 'rx', 'patientDocument',
      'sOAPNote', 'invoice', 'payment', 'subscription', 'influencer'
    ];

    let allValid = true;

    for (const table of tables) {
      try {
        const sqliteCount = await (this.sqliteClient as any)[table].count();
        const postgresCount = await (this.postgresClient as any)[table].count();
        
        if (sqliteCount === postgresCount) {
          this.log(`  ✓ ${table}: ${postgresCount} records match`, 'success');
        } else {
          this.log(`  ✗ ${table}: SQLite(${sqliteCount}) != PostgreSQL(${postgresCount})`, 'error');
          allValid = false;
        }
      } catch (error) {
        this.log(`  ✗ Error verifying ${table}: ${error}`, 'error');
        allValid = false;
      }
    }

    return allValid;
  }

  public async migrate() {
    try {
      this.log('========================================', 'info');
      this.log('Starting Database Migration', 'info');
      this.log('SQLite → PostgreSQL', 'info');
      this.log('========================================', 'info');

      // Step 1: Create backup
      const backupPath = await this.createBackup();

      // Step 2: Setup PostgreSQL schema
      await this.setupPostgresSchema();

      // Step 3: Migrate tables in dependency order
      const migrationOrder = [
        // Independent tables first
        'patientCounter',
        'provider',
        'influencer',
        
        // Patient and related
        'patient',
        'patientDocument',
        'patientAudit',
        
        // Orders and prescriptions
        'order',
        'rx',
        'orderEvent',
        
        // Financial
        'paymentMethod',
        'invoice',
        'payment',
        'subscription',
        
        // SOAP Notes
        'sOAPNote',
        'sOAPNoteRevision',
        
        // AI Features
        'aIConversation',
        'aIMessage',
        
        // Influencer related
        'influencerBankAccount',
        'referralTracking',
        'commission',
        'commissionPayout',
        
        // Provider audit
        'providerAudit'
      ];

      for (const table of migrationOrder) {
        await this.migrateTable(table);
      }

      // Step 4: Update sequences for auto-increment fields
      this.log('Updating PostgreSQL sequences...', 'info');
      await this.updateSequences();

      // Step 5: Verify migration
      const isValid = await this.verifyMigration();

      // Step 6: Print summary
      this.printSummary(isValid);

      if (isValid) {
        this.log('Migration completed successfully! 🎉', 'success');
        this.log(`Backup saved at: ${backupPath}`, 'info');
        this.log('You can now update DATABASE_URL to use PostgreSQL', 'success');
      } else {
        this.log('Migration completed with issues. Please review errors.', 'warning');
      }

    } catch (error) {
      this.log(`Migration failed: ${error}`, 'error');
      throw error;
    } finally {
      await this.sqliteClient.$disconnect();
      await this.postgresClient.$disconnect();
    }
  }

  private async updateSequences() {
    const sequences = [
      'Patient_id_seq',
      'Provider_id_seq',
      'Order_id_seq',
      'Invoice_id_seq',
      'SOAPNote_id_seq'
    ];

    for (const seq of sequences) {
      try {
        await this.postgresClient.$executeRawUnsafe(
          `SELECT setval('"${seq}"', (SELECT MAX(id) FROM "${seq.replace('_id_seq', '')}"));`
        );
      } catch (error) {
        // Sequence might not exist or table might be empty
        logger.info(`Note: Could not update sequence ${seq}`);
      }
    }
  }

  private printSummary(isValid: boolean) {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    logger.info('\n');
    this.log('========================================', 'info');
    this.log('Migration Summary', 'info');
    this.log('========================================', 'info');
    logger.info(`Duration: ${duration} seconds`);
    logger.info(`Tables migrated: ${this.stats.tables.length}`);
    logger.info(`Total records: ${this.stats.totalRecords}`);
    logger.info(`Migrated records: ${this.stats.migratedRecords}`);
    logger.info(`Errors: ${this.stats.errors.length}`);
    logger.info(`Status: ${isValid ? '✅ SUCCESS' : '⚠️ PARTIAL SUCCESS'}`);
    
    if (this.stats.errors.length > 0) {
      logger.info('\nErrors encountered:');
      this.stats.errors.forEach(err => {
        logger.info(`  - ${err.table}: ${err.error}`);
      });
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  
  migrator.migrate().catch((error) => {
    logger.error('Migration failed:', error);
    process.exit(1);
  });
}

export default DatabaseMigrator;
