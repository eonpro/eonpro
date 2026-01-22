/**
 * Provider Domain
 * ===============
 *
 * Public exports for the provider domain.
 * Import from '@/domains/provider' for all provider-related functionality.
 *
 * @module domains/provider
 *
 * @example
 * ```typescript
 * import { providerService, type Provider } from '@/domains/provider';
 *
 * const provider = await providerService.getById(1);
 * ```
 */

// Services (primary API)
export { providerService, type ProviderService, type ListProvidersResult } from './services';

// Repositories (for advanced use cases)
export { providerRepository, type ProviderRepository } from './repositories';

// Types
export type {
  Provider,
  ProviderWithClinic,
  CreateProviderInput,
  UpdateProviderInput,
  ListProvidersFilters,
  ProviderAuditEntry,
  NpiVerificationResult,
} from './types';
export { PROVIDER_AUDIT_FIELDS } from './types';

// Validation schemas
export {
  createProviderSchema,
  updateProviderSchema,
  verifyNpiSchema,
  setPasswordSchema,
} from './validation';

// Re-export UserContext for convenience (from shared)
export type { UserContext } from '../shared/types';
