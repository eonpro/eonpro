import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { logger } from '@/lib/logger';

import * as searchPatients from './searchPatients';
import * as getPatientDetails from './getPatientDetails';
import * as getPatientOrders from './getPatientOrders';
import * as getPatientPrescriptions from './getPatientPrescriptions';
import * as getSOAPNotes from './getSOAPNotes';
import * as getTrackingInfo from './getTrackingInfo';
import * as getClinicStatistics from './getClinicStatistics';
import * as lookupMedication from './lookupMedication';
import * as getSIGTemplate from './getSIGTemplate';

interface ToolModule {
  definition: ChatCompletionTool;
  execute: (params: any, clinicId: number) => Promise<unknown>;
}

const toolModules: Record<string, ToolModule> = {
  search_patients: searchPatients,
  get_patient_details: getPatientDetails,
  get_patient_orders: getPatientOrders,
  get_patient_prescriptions: getPatientPrescriptions,
  get_soap_notes: getSOAPNotes,
  get_tracking_info: getTrackingInfo,
  get_clinic_statistics: getClinicStatistics,
  lookup_medication: lookupMedication,
  get_sig_template: getSIGTemplate,
};

// Tools whose results are deterministic (no DB queries) and safe to cache
const CACHEABLE_TOOLS = new Set(['lookup_medication', 'get_sig_template']);
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 100;

const resultCache = new Map<string, { result: string; expiresAt: number }>();

function getCacheKey(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

function pruneCache() {
  if (resultCache.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    if (entry.expiresAt < now || resultCache.size > CACHE_MAX_ENTRIES) {
      resultCache.delete(key);
    }
  }
}

export const allToolDefinitions: ChatCompletionTool[] = Object.values(toolModules).map(
  (m) => m.definition,
);

export async function routeToolCall(
  name: string,
  args: Record<string, unknown>,
  clinicId: number,
): Promise<string> {
  const tool = toolModules[name];
  if (!tool) {
    logger.warn('[BeccaTools] Unknown tool called', { name });
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  // Check cache for static knowledge tools
  if (CACHEABLE_TOOLS.has(name)) {
    const cacheKey = getCacheKey(name, args);
    const cached = resultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('[BeccaTools] Cache hit', { tool: name });
      return cached.result;
    }
  }

  const startMs = Date.now();
  try {
    const result = await tool.execute(args, clinicId);
    const elapsed = Date.now() - startMs;
    const json = JSON.stringify(result);

    logger.info('[BeccaTools] Tool executed', { tool: name, clinicId, elapsed });

    // Cache static knowledge results
    if (CACHEABLE_TOOLS.has(name)) {
      const cacheKey = getCacheKey(name, args);
      resultCache.set(cacheKey, { result: json, expiresAt: Date.now() + CACHE_TTL_MS });
      pruneCache();
    }

    return json;
  } catch (err) {
    const elapsed = Date.now() - startMs;
    logger.error('[BeccaTools] Tool execution failed', {
      tool: name,
      clinicId,
      elapsed,
      error: err instanceof Error ? err.message : String(err),
    });
    return JSON.stringify({ error: `Tool "${name}" failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
}

export function getToolNames(): string[] {
  return Object.keys(toolModules);
}
