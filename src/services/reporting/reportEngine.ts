/**
 * Enterprise Report Engine
 *
 * Central orchestrator for all report data sources. Provides:
 * - runReport(config): execute any report configuration
 * - getDataSources(): list all available data sources with their columns/filters
 * - getDataSource(id): get a specific data source definition
 */

import { revenueDataSource } from './dataSources/revenue';
import { commissionsDataSource } from './dataSources/commissions';
import { patientsDataSource } from './dataSources/patients';
import { fulfillmentDataSource } from './dataSources/fulfillment';
import { providerDataSource } from './dataSources/provider';
import { affiliatesDataSource } from './dataSources/affiliates';
import { subscriptionsDataSource } from './dataSources/subscriptions';
import type { DataSourceAdapter, DataSourceDef, ReportConfig, ReportResult } from './types';

const dataSources: Map<string, DataSourceAdapter> = new Map([
  ['revenue', revenueDataSource],
  ['commissions', commissionsDataSource],
  ['patients', patientsDataSource],
  ['fulfillment', fulfillmentDataSource],
  ['provider', providerDataSource],
  ['affiliates', affiliatesDataSource],
  ['subscriptions', subscriptionsDataSource],
]);

export function getDataSources(): DataSourceDef[] {
  return Array.from(dataSources.values()).map((ds) => ds.definition);
}

export function getDataSource(id: string): DataSourceDef | null {
  return dataSources.get(id)?.definition || null;
}

export async function runReport(config: ReportConfig): Promise<ReportResult> {
  const adapter = dataSources.get(config.dataSource);
  if (!adapter) {
    throw new Error(`Unknown data source: ${config.dataSource}`);
  }
  return adapter.execute(config);
}

export type { ReportConfig, ReportResult, DataSourceDef };
