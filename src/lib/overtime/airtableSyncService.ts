/**
 * Airtable Sync Service for Overtime Men's Clinic
 *
 * Pulls intake records from all 6 Airtable tables and syncs them into EONPRO
 * by calling the existing webhook handler internally.
 * This replaces the need for individual webhook automation scripts.
 */

import {
  AirtableClient,
  AirtableRecord,
  AirtableSyncResult,
  OVERTIME_AIRTABLE_TABLES,
  createAirtableClient,
} from './airtableClient';
import type { OvertimeTreatmentType } from './types';
import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

export interface SyncOptions {
  /** Only sync records created after this date */
  since?: Date;
  /** Only sync specific treatment types */
  treatmentTypes?: OvertimeTreatmentType[];
  /** Maximum records to sync per table */
  maxRecordsPerTable?: number;
  /** Dry run - don't actually create patients */
  dryRun?: boolean;
  /** Whether to mark records as synced in Airtable (requires write access) */
  markAsSynced?: boolean;
  /** Field name in Airtable to use for tracking sync status */
  syncStatusField?: string;
}

export interface SyncSummary {
  startedAt: Date;
  completedAt: Date;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  results: AirtableSyncResult[];
}

interface WebhookResponse {
  success: boolean;
  eonproPatientId?: string;
  message?: string;
  error?: string;
}

// =============================================================================
// Sync Service Class
// =============================================================================

export class AirtableSyncService {
  private client: AirtableClient;
  private webhookUrl: string;
  private webhookSecret: string;

  constructor(client?: AirtableClient) {
    this.client = client ?? createAirtableClient();

    // Use the production URL for webhook calls
    // Vercel serverless functions can't reliably call routes on the same deployment
    // So we use the stable production domain
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app';
    this.webhookUrl = `${baseUrl}/api/webhooks/overtime-intake`;
    this.webhookSecret = process.env.OVERTIME_INTAKE_WEBHOOK_SECRET || '';
  }

  /**
   * Sync all tables or specific treatment types
   */
  async syncAll(options: SyncOptions = {}): Promise<SyncSummary> {
    const startedAt = new Date();
    const results: AirtableSyncResult[] = [];
    let totalRecords = 0;
    let successCount = 0;
    let errorCount = 0;
    const skippedCount = 0;

    // Filter tables by treatment type if specified
    const tablesToSync = options.treatmentTypes
      ? OVERTIME_AIRTABLE_TABLES.filter((t) => options.treatmentTypes!.includes(t.treatmentType))
      : OVERTIME_AIRTABLE_TABLES;

    logger.info('[AirtableSync] Starting sync', { tableCount: tablesToSync.length });

    for (const table of tablesToSync) {
      try {
        const result = await this.syncTable(table.id, table.treatmentType, options);
        results.push(result);
        totalRecords += result.recordsProcessed;
        successCount += result.recordIds.length;
        errorCount += result.errors.length;
      } catch (error) {
        logger.error('[AirtableSync] Failed to sync table', { tableName: table.name, error: error instanceof Error ? error.message : String(error) });
        results.push({
          table: table.name,
          treatmentType: table.treatmentType,
          recordsProcessed: 0,
          recordIds: [],
          errors: [{ recordId: 'N/A', error: String(error) }],
        });
        errorCount++;
      }

      // Rate limiting between tables
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const completedAt = new Date();

    logger.info('[AirtableSync] Completed', { totalRecords, successCount, errorCount, skippedCount });

    return {
      startedAt,
      completedAt,
      totalRecords,
      successCount,
      errorCount,
      skippedCount,
      results,
    };
  }

  /**
   * Sync a specific table
   */
  async syncTable(
    tableId: string,
    treatmentType: OvertimeTreatmentType,
    options: SyncOptions = {}
  ): Promise<AirtableSyncResult> {
    const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.id === tableId);
    const tableName = table?.name ?? tableId;

    logger.info('[AirtableSync] Syncing table', { tableName, treatmentType });

    // Build filter formula for Airtable
    let filterFormula = '';
    if (options.since) {
      // Filter by created time (requires CREATED_TIME() function in Airtable)
      const sinceISO = options.since.toISOString();
      filterFormula = `CREATED_TIME() >= '${sinceISO}'`;
    }

    // Optionally filter by sync status field
    if (options.syncStatusField) {
      const syncFilter = `{${options.syncStatusField}} = ''`;
      filterFormula = filterFormula ? `AND(${filterFormula}, ${syncFilter})` : syncFilter;
    }

    // Fetch records from Airtable
    const records = await this.client.listAllRecords(tableId, {
      filterByFormula: filterFormula || undefined,
      sort: [{ field: 'Response ID', direction: 'desc' }],
    });

    // Limit records if specified
    const recordsToProcess = options.maxRecordsPerTable
      ? records.slice(0, options.maxRecordsPerTable)
      : records;

    logger.info('[AirtableSync] Found records', { totalFound: records.length, processing: recordsToProcess.length });

    const processedIds: string[] = [];
    const errors: Array<{ recordId: string; error: string }> = [];

    for (const record of recordsToProcess) {
      try {
        if (options.dryRun) {
          logger.info('[AirtableSync] [DRY RUN] Would process record', { recordId: record.id });
          processedIds.push(record.id);
          continue;
        }

        const result = await this.processRecord(record, treatmentType);

        if (result.success) {
          processedIds.push(record.id);

          // Optionally mark as synced in Airtable
          if (options.markAsSynced && options.syncStatusField) {
            await this.client.updateRecord(tableId, record.id, {
              [options.syncStatusField]: new Date().toISOString(),
            });
          }

          logger.info('[AirtableSync] Processed record', { recordId: record.id, eonproPatientId: result.eonproPatientId });
        } else {
          errors.push({ recordId: record.id, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        logger.error('[AirtableSync] Error processing record', { recordId: record.id, error: error instanceof Error ? error.message : String(error) });
        errors.push({ recordId: record.id, error: String(error) });
      }

      // Rate limiting between records
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      table: tableName,
      treatmentType,
      recordsProcessed: recordsToProcess.length,
      recordIds: processedIds,
      errors,
    };
  }

  /**
   * Process a single Airtable record by sending it to the webhook
   */
  private async processRecord(
    record: AirtableRecord,
    treatmentType: OvertimeTreatmentType
  ): Promise<WebhookResponse> {
    // Normalize the Airtable fields to webhook payload format
    const normalizedFields = this.client.normalizeFields(record.fields, treatmentType);

    // Add metadata
    const payload = {
      ...normalizedFields,
      treatmentType,
      'airtable-record-id': record.id,
      'airtable-created-time': record.createdTime,
      'submission-id': normalizedFields['submission-id'] || `airtable-${record.id}`,
    };

    // Call the existing webhook endpoint
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': this.webhookSecret,
        'X-Sync-Source': 'airtable-sync-service',
      },
      body: JSON.stringify(payload),
    });

    // Get response text first to handle non-JSON responses
    const responseText = await response.text();

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(responseText);
    } catch {
      // If not JSON, return the raw text as error
      logger.error('[AirtableSync] Non-JSON response from webhook', { responsePreview: responseText.substring(0, 200) });
      return {
        success: false,
        error: `Webhook returned non-JSON: ${responseText.substring(0, 100)}`,
      };
    }

    if (!response.ok) {
      const errorMsg =
        typeof result.error === 'string'
          ? result.error
          : JSON.stringify(result.error) || `HTTP ${response.status}`;
      return {
        success: false,
        error: errorMsg,
      };
    }

    return {
      success: true,
      eonproPatientId: result.eonproPatientId as string | undefined,
      message: result.message as string | undefined,
    };
  }

  /**
   * Sync a single record by ID
   */
  async syncRecord(
    tableId: string,
    recordId: string,
    treatmentType: OvertimeTreatmentType
  ): Promise<WebhookResponse> {
    const record = await this.client.getRecord(tableId, recordId);
    return this.processRecord(record, treatmentType);
  }

  /**
   * Get table statistics
   */
  async getTableStats(tableId: string): Promise<{
    totalRecords: number;
    tableName: string;
    treatmentType: OvertimeTreatmentType | null;
  }> {
    const table = OVERTIME_AIRTABLE_TABLES.find((t) => t.id === tableId);
    const allRecords = await this.client.listAllRecords(tableId);

    return {
      totalRecords: allRecords.length,
      tableName: table?.name ?? tableId,
      treatmentType: table?.treatmentType ?? null,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a sync service instance
 */
export function createSyncService(): AirtableSyncService {
  return new AirtableSyncService();
}
