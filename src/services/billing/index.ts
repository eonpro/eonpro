/**
 * Billing Services
 * ================
 * 
 * Exports all billing-related services for the EONPRO platform.
 */

export { platformFeeService } from './platformFeeService';
export type { 
  FeeConfigInput,
  FeeCalculationDetails,
  FeeSummary,
  FeeEventWithDetails,
  DateRange,
} from './platformFeeService';

export { clinicInvoiceService } from './clinicInvoiceService';
export type {
  GenerateInvoiceOptions,
  InvoiceWithDetails,
  InvoiceListFilters,
  InvoiceSummary,
} from './clinicInvoiceService';
