/**
 * Provider Services
 * =================
 * 
 * Enterprise features for provider routing and compensation.
 */

export { providerRoutingService, type ProviderRoutingService } from './providerRoutingService';
export { providerCompensationService, type ProviderCompensationService } from './providerCompensationService';

// Re-export types
export type {
  RoutingResult,
  SoapApprovalCheck,
  AvailableProvider,
  PrescriptionQueueItem,
} from './providerRoutingService';

export type {
  DateRange,
  EarningsSummary,
  CompensationPlanWithProvider,
  CompensationPlanInput,
  CalculationDetails,
  CompensationEventWithDetails,
} from './providerCompensationService';
