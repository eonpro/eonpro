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

  const startMs = Date.now();
  try {
    const result = await tool.execute(args, clinicId);
    const elapsed = Date.now() - startMs;
    logger.info('[BeccaTools] Tool executed', { tool: name, clinicId, elapsed });
    return JSON.stringify(result);
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
