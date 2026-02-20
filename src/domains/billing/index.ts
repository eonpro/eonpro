/**
 * Billing Domain
 *
 * @module domains/billing
 */

export { invoiceService, createInvoiceService } from './services/invoice.service';
export type { InvoiceService } from './services/invoice.service';
export type {
  InvoiceFilterOptions,
  InvoicePaginationOptions,
  InvoiceSummary,
  PaginatedInvoices,
  CreateInvoiceInput,
  InvoiceItemInput,
} from './types';
